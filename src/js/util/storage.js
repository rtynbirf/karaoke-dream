// Безопасное хранилище настроек: localStorage, а в средах без него — память.
const mem = new Map();

export function loadJSON(key, fallback) {
  try {
    const raw = globalThis.localStorage?.getItem(key);
    if (raw == null) return fallback;
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

export function saveJSON(key, val) {
  try {
    globalThis.localStorage?.setItem(key, JSON.stringify(val));
  } catch {
    mem.set(key, val);
  }
}

export const KEYS = {
  settings: 'kd.settings',
  leaderboard: 'kd.leaderboard',
  queue: 'kd.queue',
  singer: 'kd.singer',
};
