// Демо-песня «Неоновый вектор» — единый источник правды.
// Из одного описания выводятся: таймлайн (для синтезатора, оценки и canvas)
// и Enhanced LRC (для подсветки слов). Рассинхрон текста и мелодии невозможен
// по построению — это и есть «канон».

import { toLRC } from '../lyrics/lrc.js';

export const DEMO = {
  meta: { ti: 'Неоновый вектор', ar: 'KARAOKE DREAM 2.0' },
  bpm: 96,
  beatsPerBar: 4,
  introBars: 4,   // 10 секунд разгона: пэд, бас, бит
  tailBars: 2,
  baseMidi: 62,   // D4 — комфортная зона; коридор сдвигает при необходимости
  chords: ['Am', 'F', 'C', 'G'], // один аккорд на такт, цикл
  lines: [
    { text: 'Город дышит неоном в темноте', notes: [0, 3, 5, 3, 7, 5, 3, 0] },
    { text: 'Я иду по стеклянной воде', notes: [7, 5, 3, 0, -2, 0, 3, 5] },
    { text: 'Фонари считают мои шаги', notes: [5, 7, 5, 3, 0, -2, 0, 3] },
    { text: 'Каждый вектор найдёт свою волну', notes: [0, 3, 5, 7, 5, 3, 0, -2] },
    { text: 'Не зови меня в общий поток', notes: [7, 5, 3, 0, -2, 0] },
    { text: 'У меня свой маршрут и срок', notes: [3, 5, 7, 5, 3, 0] },
    { text: 'Среда лишь цена за каждый шаг', notes: [0, 2, 3, 5, 3, 2] },
    { text: 'Я пою там, где тренды молчат', notes: [3, 5, 7, 5, 3, 0] },
  ],
};

// Ля минор: корни в третьей октаве.
const ROOTS = { C: 48, D: 50, E: 52, F: 53, G: 55, A: 57, B: 59 };

export function chordInfo(name) {
  const m = /^([A-G])(b|#)?(m|min)?$/i.exec(name);
  if (!m) return { rootMidi: 57, intervals: [0, 4, 7], name };
  const letter = m[1].toUpperCase();
  const minor = Boolean(m[3]);
  return {
    rootMidi: ROOTS[letter],
    intervals: minor ? [0, 3, 7] : [0, 4, 7],
    name,
  };
}

export function demoTimeline(demo = DEMO) {
  const bar = (60 / demo.bpm) * demo.beatsPerBar; // 2.5 c при 96 BPM
  const barsPerLine = 4;
  const lines = demo.lines.map((L, li) => {
    const start = (demo.introBars + li * barsPerLine) * bar;
    const end = start + barsPerLine * bar - 0.35;
    const words = L.text.split(/\s+/).filter(Boolean);

    // вес слова — по числу слогообразующих гласных
    const weights = words.map((w) => Math.max(1, (w.match(/[аеёиоуыэюяaeiouy]/gi) || []).length));
    const total = weights.reduce((a, b) => a + b, 0);
    const lead = (end - start) * 0.86;

    let t = start;
    const wordObjs = words.map((text, i) => {
      const d = lead * weights[i] / total;
      const midi = demo.baseMidi + L.notes[i % L.notes.length];
      const obj = { text, start: t, end: t + Math.max(0.22, d - 0.05), midi };
      t += d;
      return obj;
    });

    return { start, end, text: L.text, words: wordObjs };
  });

  const totalBars = demo.introBars + demo.lines.length * barsPerLine + demo.tailBars;
  const chords = [];
  for (let b = 0; b < totalBars; b++) {
    const info = chordInfo(demo.chords[b % demo.chords.length]);
    chords.push({ bar: b, start: b * bar, dur: bar, ...info });
  }

  return { bar, bpm: demo.bpm, duration: totalBars * bar, lines, chords, baseMidi: demo.baseMidi };
}

export function buildDemoLRC(demo = DEMO) {
  const tl = demoTimeline(demo);
  return toLRC({
    meta: { ...demo.meta },
    lines: tl.lines.map((l) => ({
      time: l.start,
      words: l.words.map((w) => ({ text: w.text, time: w.start })),
    })),
  });
}

export function demoDuration(demo = DEMO) {
  const bar = (60 / demo.bpm) * demo.beatsPerBar;
  return (demo.introBars + demo.lines.length * 4 + demo.tailBars) * bar;
}
