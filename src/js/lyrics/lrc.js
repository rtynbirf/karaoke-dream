// Парсер и сериализатор Enhanced LRC: [mm:ss.xx] — строки, <mm:ss.xx> — слова.
// Чистая логика: никаких DOM/AudioContext на верхнем уровне.

const LINE_TAG = /\[(\d{1,3}):(\d{1,2})(?:[.:](\d{1,3}))?\]/g;
const WORD_TAG = /<(\d{1,3}):(\d{1,2})(?:[.:](\d{1,3}))?>/g;
const META_TAG = /^\[(ti|ar|al|by|offset|length):(.*)\]$/i;

function tagSeconds(m) {
  const frac = m[3] || '';
  return (+m[1]) * 60 + (+m[2]) + (frac ? (+frac) / 10 ** frac.length : 0);
}

export function parseTimeTag(str) {
  const m = /(\d{1,3}):(\d{1,2})(?:[.:](\d{1,3}))?/.exec(String(str));
  return m ? tagSeconds(m) : null;
}

export function formatTimeTag(sec, word = false) {
  sec = Math.max(0, sec || 0);
  let m = Math.floor(sec / 60);
  let s = Math.floor(sec % 60);
  let cs = Math.round((sec - Math.floor(sec)) * 100);
  if (cs >= 100) { s += 1; cs -= 100; }
  if (s >= 60) { m += 1; s -= 60; }
  const open = word ? '<' : '[';
  const close = word ? '>' : ']';
  return `${open}${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(cs).padStart(2, '0')}${close}`;
}

function tokenizeWords(content) {
  const words = [];
  let cur = null;
  let last = 0;
  let buf = '';
  let m;
  WORD_TAG.lastIndex = 0;
  while ((m = WORD_TAG.exec(content))) {
    buf += content.slice(last, m.index);
    const trimmed = buf.trim();
    if (trimmed) words.push({ text: trimmed, time: cur });
    buf = '';
    cur = tagSeconds(m);
    last = WORD_TAG.lastIndex;
  }
  buf += content.slice(last);
  const tail = buf.trim();
  if (tail) words.push({ text: tail, time: cur });
  return words;
}

function distributeWords(line, nextTime) {
  const tokens = (line.text || '').split(/\s+/).filter(Boolean);
  if (!tokens.length) { line.words = []; return; }
  const span = Math.max(0.6, nextTime - line.time) * 0.9;
  const weights = tokens.map((w) => Math.max(1, (w.match(/[\p{L}\p{N}]/gu) || ['1']).length));
  const total = weights.reduce((a, b) => a + b, 0);
  let t = line.time + (nextTime - line.time) * 0.04;
  line.words = tokens.map((text, i) => {
    const d = span * weights[i] / total;
    const word = { text, time: t };
    t += d;
    return word;
  });
}

export function parseLRC(text) {
  const meta = {};
  const lines = [];
  for (const raw of String(text).split(/\r?\n/)) {
    const trimmed = raw.trim();
    if (!trimmed) continue;
    const metaMatch = META_TAG.exec(trimmed);
    if (metaMatch) { meta[metaMatch[1].toLowerCase()] = metaMatch[2].trim(); continue; }

    LINE_TAG.lastIndex = 0;
    const times = [...trimmed.matchAll(LINE_TAG)].map(tagSeconds);
    if (!times.length) continue;

    const content = trimmed.replace(LINE_TAG, '').trim();
    const plain = content.replace(WORD_TAG, ' ').replace(/\s+/g, ' ').trim();
    const words = tokenizeWords(content);

    for (const time of times) {
      lines.push({
        time,
        text: plain,
        words: words.some((w) => w.time != null) ? words.map((w) => ({ text: w.text, time: w.time })) : null,
      });
    }
  }

  lines.sort((a, b) => a.time - b.time);

  const offset = meta.offset != null && !Number.isNaN(+meta.offset) ? (+meta.offset) / 1000 : 0;
  if (offset) lines.forEach((l) => { l.time = Math.max(0, l.time + offset); });

  for (let i = 0; i < lines.length; i++) {
    const next = lines[i + 1];
    const nextTime = next ? next.time : lines[i].time + 5;
    if (!lines[i].words) distributeWords(lines[i], nextTime);
  }

  return { meta, lines };
}

export function toLRC(song) {
  const out = [];
  const meta = song.meta || {};
  for (const k of ['ti', 'ar', 'al', 'by']) {
    if (meta[k]) out.push(`[${k}:${meta[k]}]`);
  }
  const lines = [...(song.lines || [])].sort((a, b) => a.time - b.time);
  for (const line of lines) {
    const words = line.words && line.words.length
      ? line.words
      : [{ text: line.text || '', time: line.time }];
    const parts = [formatTimeTag(line.time)];
    for (const w of words) parts.push(`${formatTimeTag(w.time, true)}${w.text}`);
    out.push(parts.join(''));
  }
  return out.join('\n');
}
