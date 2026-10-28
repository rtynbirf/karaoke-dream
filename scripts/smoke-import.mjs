// Smoke-тест: все ES-модули проекта должны импортироваться в Node без ошибок.
// Гарантирует, что верхний уровень модулей не трогает DOM/AudioContext.

const modules = [
  '../src/js/util/bus.js',
  '../src/js/util/storage.js',
  '../src/js/util/dom.js',
  '../src/js/lyrics/lrc.js',
  '../src/js/lyrics/sync.js',
  '../src/js/scoring/judge.js',
  '../src/js/scoring/corridor.js',
  '../src/js/songs/demo.js',
  '../src/js/audio/pitch.js',
  '../src/js/audio/synth.js',
  '../src/js/audio/engine.js',
  '../src/js/ui/canvas.js',
  '../src/js/ui/screens.js',
  '../src/js/main.js',
];

let failed = 0;
for (const m of modules) {
  try {
    await import(new URL(m, import.meta.url).href);
    console.log(`ok   ${m}`);
  } catch (e) {
    failed++;
    console.error(`FAIL ${m}: ${e.message}`);
  }
}
if (failed) {
  console.error(`smoke: ${failed} модулей не импортировались`);
  process.exit(1);
}
console.log('smoke: все модули импортируются');
