// Экраны приложения. Каждый рендерит #app с нуля и подписывает кнопки на
// действия (объект `a`), переданные из main.js. Пользовательский текст —
// только через el()/textContent.

import { el, qs, fmtTime } from '../util/dom.js';
import { MODES } from '../scoring/judge.js';
import { corridorLabel } from '../scoring/corridor.js';

let meterIv = null;
function stopMeter() {
  if (meterIv) { clearInterval(meterIv); meterIv = null; }
}

function chip(txt, cls = '') { return el('span', { class: `chip ${cls}` }, txt); }

function field(label, control) {
  return el('label', { class: 'field' }, el('span', { class: 'field-label' }, label), control);
}

export function screenHome(a) {
  stopMeter();
  const root = qs('#app');
  const hero = el('section', { class: 'card hero fade-in' },
    el('div', { class: 'kicker' }, 'KARAOKE DREAM 2.0'),
    el('h1', { class: 'h1 glow-cyan' }, 'КАРАОКЕ МЕЧТЫ'),
    el('p', { class: 'sub' },
      'Среда не двигает вектор — она меняет цену шага. Пой: если станет трудно, сцена сама транспонируется к тебе. Это «Зелёный коридор».'),
    el('div', { class: 'row' },
      el('button', { class: 'btn primary', onclick: () => a.goDemo() }, 'Демо-песня'),
      el('button', { class: 'btn', onclick: () => a.goUpload() }, 'Свой трек'),
    ),
    el('div', { class: 'row' },
      el('button', { class: 'btn ghost', onclick: () => a.goParty() }, 'Вечеринка'),
      el('button', { class: 'btn ghost', onclick: () => a.goHelp() }, 'Как это работает'),
    ),
    el('div', { class: 'badges' },
      chip('pitch YIN'), chip('гид-вокал'), chip('минус-вокал'), chip('оценка 0–100'),
      chip('звук не покидает браузер', 'ok'),
    ),
  );
  root.replaceChildren(el('div', { class: 'wrap' }, hero));
}

export function screenSetup(a, ctx) {
  stopMeter();
  const root = qs('#app');
  const s = a.state.settings;

  const nameIn = el('input', { type: 'text', id: 'in-name', placeholder: 'Имя певца', maxlength: '24', value: s.name || '' });
  const modeSel = el('select', { id: 'in-mode' },
    el('option', { value: 'friendly', selected: s.mode === 'friendly' }, 'Дружелюбный — мягкие допуски'),
    el('option', { value: 'jury', selected: s.mode === 'jury' }, 'Жюри — строгий 0–100'));
  const latIn = el('input', { type: 'range', min: '0', max: '300', step: '10', value: String(s.latencyMs ?? 180), id: 'in-lat' });
  const latVal = el('span', { class: 'range-val' }, `${s.latencyMs ?? 180} мс`);
  latIn.addEventListener('input', () => { latVal.textContent = `${latIn.value} мс`; });

  const meter = el('div', { class: 'meter' }, el('i', { id: 'meter-i' }));
  const micBtn = el('button', { class: 'btn' }, 'Включить микрофон');
  micBtn.addEventListener('click', async () => {
    micBtn.disabled = true;
    try {
      await a.enableMic();
      micBtn.textContent = 'Микрофон включён';
      micBtn.classList.add('ok');
      stopMeter();
      meterIv = setInterval(() => {
        const v = a.micLevel();
        const bar = meter.querySelector('i');
        if (bar) bar.style.width = `${Math.min(100, Math.round(v * 260))}%`;
      }, 80);
    } catch {
      micBtn.textContent = 'Доступ не дали — можно без микрофона';
    }
    micBtn.disabled = false;
  });

  const parts = [el('h2', { class: 'h2' }, ctx.title)];

  if (ctx.type === 'upload') {
    const fileIn = el('input', { type: 'file', accept: 'audio/*' });
    const fileName = el('span', { class: 'note-small' }, ' файл не выбран');
    fileIn.addEventListener('change', () => {
      ctx.file = fileIn.files[0] || null;
      fileName.textContent = ctx.file ? ` ${ctx.file.name}` : ' файл не выбран';
    });
    const lrcTa = el('textarea', { id: 'in-lrc', rows: '7', placeholder: '[00:12.00]Первая строка\n[00:17.40]Вторая строка\n\nВставь лирику с таймингами (LRC).\nПусто — режим свободного пения без оценки.' });
    const vocChk = el('input', { type: 'checkbox', id: 'in-voc' });
    parts.push(
      el('div', { class: 'grid2' },
        field('Аудиофайл (mp3/wav/ogg)', el('div', {}, fileIn, fileName)),
        field('Убрать вокал (вычитание центрального канала)', vocChk),
      ),
      field('Лирика LRC (опционально)', lrcTa),
    );
  }

  const collect = () => {
    s.name = nameIn.value.trim();
    s.mode = modeSel.value;
    s.latencyMs = +latIn.value;
    if (ctx.type === 'upload') {
      const ta = qs('#in-lrc');
      ctx.lrc = ta ? ta.value : '';
      ctx.vocalRemove = Boolean(qs('#in-voc')?.checked);
    }
    a.persistSettings();
  };

  parts.push(
    el('div', { class: 'grid2' },
      field('Имя на сцене', nameIn),
      field('Режим оценки', modeSel),
    ),
    field(`Задержка звука (компенсация) ${latVal}`, latIn),
    el('div', { class: 'grid2' },
      field('Микрофон', el('div', {}, micBtn, meter)),
      el('div'),
    ),
    el('div', { class: 'row' },
      el('button', { class: 'btn primary', onclick: () => { collect(); a.start(ctx); } }, 'На сцену'),
      el('button', { class: 'btn ghost', onclick: () => { collect(); a.start(ctx); } }, 'Продолжить без микрофона'),
      el('button', { class: 'btn ghost', onclick: () => a.home() }, 'Назад'),
    ),
  );

  root.replaceChildren(el('div', { class: 'wrap' }, el('section', { class: 'card fade-in' }, parts)));
}

export function screenPerform(a, info) {
  stopMeter();
  const root = qs('#app');

  const btnPause = el('button', { class: 'btn small', id: 'btn-pause' }, 'Пауза');
  const btnRestart = el('button', { class: 'btn small ghost' }, 'Сначала');
  const btnFs = el('button', { class: 'btn small ghost' }, 'Большой экран');
  const btnExit = el('button', { class: 'btn small ghost' }, 'Выход');

  const stage = el('div', { class: 'stage' },
    el('div', { class: 'trail-wrap' }, el('canvas', { id: 'trail' })),
    el('div', { class: 'lyrics-col' },
      el('div', { class: 'lyrics', id: 'lyrics' }, el('div', { class: 'line free' }, '…')),
      el('div', { class: 'next-preview', id: 'next-preview' }),
    ),
    el('aside', { class: 'hud' },
      el('div', { class: 'hud-title' }, 'СЧЁТ'),
      el('div', { class: 'score-big glow-mag', id: 'hud-score' }, '—'),
      el('div', { class: 'hud-line', id: 'hud-line' }, 'строка: —'),
      el('div', { class: 'bars' },
        barRow('точность', 'b-acc'), barRow('ритм', 'b-rhy'), barRow('стабильность', 'b-sta'),
      ),
      el('div', { class: 'vol' },
        el('label', {}, 'минус ', volSlider('vol-music', a.state.settings.musicVol)),
        el('label', {}, 'гид ', volSlider('vol-guide', a.state.settings.guideVol)),
      ),
    ),
  );

  root.replaceChildren(el('section', { class: 'perform' },
    el('div', { class: 'perf-top' },
      el('div', { class: 'perf-title' },
        el('strong', {}, info.title),
        el('span', { class: 'note-small' }, ` ${info.artist || ''}`),
      ),
      el('div', { class: 'perf-chips' },
        chip(`режим: ${MODES[a.state.settings.mode].label}`),
        chip('коридор: оригинал', '', 'chip-corridor'),
        chip(`певец: ${info.singer || a.state.settings.name || 'Гость'}`),
      ),
      el('div', { class: 'row tight' }, btnPause, btnRestart, btnFs, btnExit),
    ),
    el('div', { class: 'progress' }, el('i', { id: 'prog-i' })),
    el('input', { type: 'range', id: 'seek', min: '0', max: String(info.duration || 60), step: '0.1', value: '0' }),
    stage,
  ));

  // события управления (делегируем в main через a.controls)
  a.controls({
    pause: btnPause,
    restart: btnRestart,
    fullscreen: btnFs,
    exit: btnExit,
    seek: qs('#seek'),
    volMusic: qs('#vol-music'),
    volGuide: qs('#vol-guide'),
  });
}

function barRow(label, id) {
  return el('div', { class: 'bar-row' },
    el('span', {}, label),
    el('div', { class: 'bar' }, el('i', { id })),
  );
}

function volSlider(id, val) {
  return el('input', { type: 'range', id, min: '0', max: '1', step: '0.05', value: String(val ?? 0.85) });
}

export function screenResult(a) {
  stopMeter();
  const root = qs('#app');
  const s = a.state.session;
  const done = a.state.scores;

  const total = done.length ? Math.round(done.reduce((x, y) => x + y.total, 0) / done.length) : 0;
  const avg = (k) => {
    const arr = done.map((x) => x[k]).filter((v) => v != null);
    return arr.length ? Math.round((100 * arr.reduce((x, y) => x + y, 0)) / arr.length) : null;
  };
  const acc = avg('accuracy');
  const rhy = avg('rhythm');
  const sta = avg('stability');

  const verdict = total >= 90 ? 'Золото сцены — вектор набран.'
    : total >= 75 ? 'Уверенный вектор. Коридор почти не понадобился.'
    : total >= 55 ? 'Ты в коридоре: среда подстроилась, ты дотянул.'
    : total >= 35 ? 'Растёшь. Коридор держал цену шага пониже.'
    : 'Δv зафиксирован. Ещё круг — среда уже ближе к тебе.';

  const lb = a.state.leaderboard.slice(0, 5).map((entry, i) =>
    el('li', { class: entry.name === (s.singer || a.state.settings.name) && entry.score === total ? 'me' : '' },
      `${i + 1}. ${entry.name} — ${entry.score} (${entry.song}, ${entry.date})`));

  root.replaceChildren(el('div', { class: 'wrap' }, el('section', { class: 'card fade-in result' },
    el('div', { class: 'kicker' }, s?.title || 'Сессия'),
    el('div', { class: 'score-big glow-cyan' }, String(total)),
    el('p', { class: 'sub' }, verdict),
    el('div', { class: 'grid2' },
      el('div', { class: 'bars vertical' },
        barRow(`точность ${acc == null ? '—' : acc}`, 'r-acc'),
        barRow(`ритм ${rhy == null ? '—' : rhy}`, 'r-rhy'),
        barRow(`стабильность ${sta == null ? '—' : sta}`, 'r-sta'),
      ),
      el('div', {},
        el('h3', {}, 'Зелёный коридор'),
        el('p', { class: 'note-small' },
          s?.type === 'demo'
            ? `Итог: ${corridorLabel(a.state.corridor)}. Событий: ${a.state.corridor.events.length}.`
            : 'Для своего трека коридор расширяет допуски; транспонирует демо-сцену.'),
        el('div', { class: 'events' },
          a.state.corridor.events.slice(-6).map((ev) =>
            el('div', { class: 'note-small' },
              `${ev.type === 'down' ? 'среда → к певцу' : 'возврат → к оригиналу'}: ${ev.shift} пт (ср. балл ${ev.avg})`))),
      ),
    ),
    el('h3', {}, 'Лидерборд'),
    el('ol', { class: 'lb' }, lb),
    el('div', { class: 'row' },
      el('button', { class: 'btn primary', onclick: () => a.encore() }, 'Ещё круг'),
      el('button', { class: 'btn', onclick: () => a.goParty() }, 'Вечеринка'),
      el('button', { class: 'btn ghost', onclick: () => a.home() }, 'Домой'),
    ),
  )));

  fillBars([['#r-acc', acc], ['#r-rhy', rhy], ['#r-sta', sta]]);
}

function fillBars(pairs) {
  for (const [sel, v] of pairs) {
    const bar = qs(sel);
    if (bar) bar.style.width = `${Math.max(0, Math.min(100, v ?? 0))}%`;
  }
}

export function screenParty(a) {
  stopMeter();
  const root = qs('#app');
  const input = el('input', { type: 'text', placeholder: 'Имя певца', maxlength: '24' });

  const addBtn = el('button', { class: 'btn primary' }, 'В очередь');
  addBtn.addEventListener('click', () => {
    a.queueAdd(input.value);
    input.value = '';
  });

  const queueList = el('ol', { class: 'queue' },
    a.state.queue.map((name, i) => el('li', {},
      el('span', {}, `${i + 1}. ${name}`),
      el('span', { class: 'row tight' },
        el('button', { class: 'btn small primary', onclick: () => a.queueStart(i) }, 'Петь'),
        el('button', { class: 'btn small ghost', onclick: () => a.queueRemove(i) }, '×'),
      ))));

  const lb = el('ol', { class: 'lb' },
    a.state.leaderboard.slice(0, 10).map((e, i) => el('li', {}, `${i + 1}. ${e.name} — ${e.score} (${e.song})`)));

  root.replaceChildren(el('div', { class: 'wrap' }, el('section', { class: 'card fade-in' },
    el('h2', { class: 'h2' }, 'Вечеринка'),
    el('p', { class: 'sub' },
      a.state.currentSinger
        ? `У микрофона: ${a.state.currentSinger}. Очередь и счёт хранятся локально.`
        : 'Очередь певцов: кто следующий — тот и поёт демо. Телефон-пульт и сетевые комнаты — в roadmap (фаза 3).'),
    el('div', { class: 'grid2' },
      el('div', {},
        el('h3', {}, 'Очередь'),
        el('div', { class: 'row' }, input, addBtn),
        queueList,
      ),
      el('div', {},
        el('h3', {}, 'Лидерборд'),
        lb,
      ),
    ),
    el('div', { class: 'row' },
      el('button', { class: 'btn primary', onclick: () => a.goDemo() }, 'Демо-песня'),
      el('button', { class: 'btn ghost', onclick: () => a.home() }, 'Домой'),
    ),
  )));
}

export function screenHelp(a) {
  stopMeter();
  const root = qs('#app');
  const card = (title, ...body) => el('section', { class: 'card fade-in' }, el('h2', { class: 'h2' }, title), ...body);

  root.replaceChildren(el('div', { class: 'wrap narrow' },
    card('Как петь',
      el('p', {}, 'Нажми «Демо-песня», дай доступ к микрофону и пой гид-мелодию — она звучит вместе с минусом. Голос рисуется розовой кривой поверх голубых нот-плашек: задача — держать кривую внутри плашек.'),
      el('p', { class: 'note-small' }, 'Совет: настрой «Задержку звука» так, чтобы подсветка слов совпадала с тем, что ты слышишь в наушниках.')),
    card('Как оценивается',
      el('p', {}, 'Каждое слово — окно оценки: точность (отклонение по центам от ноты), ритм (вступил ли вовремя), стабильность (дрожание питча). Итог строки — взвешенная сумма 0–100. Режим «Жюри» строже, «Дружелюбный» шире по допускам.'),
      el('p', { class: 'note-small' }, 'Для своего трека без MIDI-эталона честно считаются ритм и стабильность; точность питча появится вместе с авто-транскрипцией мелодии (roadmap, фаза 2).')),
    card('Зелёный коридор',
      el('p', {}, 'Среда не двигает вектор — она меняет цену шага. Провал строк — и сцена транспонируется к тебе на полтона-три (детюн, темп не меняется). Выровнялся — коридор вернёт оригинальную тональность. Это единственная караоке-сцена, где песня идёт навстречу певцу.'),
      el('p', { class: 'note-small' }, 'v(t+1) = v(t) + Δv. Коридор не меняет тебя — он меняет цену Δv.')),
    card('Что под капотом',
      el('p', {}, 'WebAudio: офлайн-рендер демо-трека (пэд, бас, барабаны, гид), YIN-детектор высоты тона на микрофоне, Enhanced LRC для пословной подсветки, минус-вокал вычитанием центрального канала. Zero-dependency, всё считается локально.'),
      el('p', { class: 'note-small' }, 'Честные ограничения прототипа: ML-разделение стемов, база песен и сетевые комнаты — в roadmap (docs/04-roadmap.md).')),
    el('div', { class: 'row' }, el('button', { class: 'btn ghost', onclick: () => a.home() }, 'Домой')),
  ));
}
