// Волна ×3 · W3-E · Профиль певца (предложение karaoke-dream#3).
// Открытый JSON-контракт singer-profile: соседние продукты роя читают и пишут те же
// поля в своих репозиториях, журнал сессий ведётся append-only. Всё локально, ноль телеметрии.
export const PROFILE_VERSION = 1;

// Мировая практика (keypitch.app/karaoke-key): большинство певцов укладывается в сдвиг −4…+4 полутона.
export const LIMITS = {
  shiftStepSemitones: 1,   // шаг сдвига тональности
  shiftLimitSemitones: 4,  // границы сдвига
  returnPerSec: 0.5,       // экспоненциальный возврат 0.5/сек
  lessonNarrow: 0.05,      // урок: −5% ширины за успешную сессию
  minWidth: 0.5
};
// Параметры калибровки: свип 110–330 Гц за 60 с, буфер 2048 сэмплов при 48 кГц.
export const CALIBRATION = { fromHz: 110, toHz: 330, durationSec: 60, bufferSamples: 2048, sampleRateHz: 48000 };

export function hzToMidi(hz) { return 69 + 12 * Math.log2(hz / 440); }
export function midiToHz(m) { return 440 * Math.pow(2, (m - 69) / 12); }

export function percentile(sorted, p) {
  if (sorted.length === 0) return 0;
  const i = (sorted.length - 1) * p;
  const lo = Math.floor(i), hi = Math.ceil(i);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo);
}

// Калибровка: гистограмма нот свипа → комфортная зона 10/90 перцентиль (регистр певца).
export function calibrate(pitchesHz) {
  const notes = pitchesHz.filter((h) => Number.isFinite(h) && h > 0).map(hzToMidi).sort((a, b) => a - b);
  const lo = percentile(notes, 0.10);
  const hi = percentile(notes, 0.90);
  return {
    comfortLowMidi: lo, comfortHighMidi: hi,
    comfortLowHz: midiToHz(lo), comfortHighHz: midiToHz(hi)
  };
}

export function createProfile() {
  return {
    version: PROFILE_VERSION,
    comfortLowMidi: 0, comfortHighMidi: 0, comfortLowHz: 0, comfortHighHz: 0,
    register: '', tempoBpm: null,
    corridorWidth: 1.0,
    sessions: [] // журнал сессий: append-only, записи не редактируются и не удаляются
  };
}

export function logSession(profile, rec) {
  profile.sessions.push(Object.assign({ at: new Date().toISOString() }, rec));
}

// Режим урока: успешная сессия (≥90% нот внутри коридора) сужает ширину на 5% (абсолютных).
export function narrowCorridor(profile, success) {
  if (!success) return profile.corridorWidth;
  profile.corridorWidth = Number(
    Math.max(LIMITS.minWidth, profile.corridorWidth - LIMITS.lessonNarrow).toFixed(4));
  return profile.corridorWidth;
}

// Драйверы хранилища профиля: браузер — IndexedDB, тесты/узел — память.
export function memoryDriver() {
  let box = null;
  return {
    async save(p) { box = JSON.parse(JSON.stringify(p)); },
    async load() { return box ? JSON.parse(JSON.stringify(box)) : null; }
  };
}

export function indexedDbDriver(dbName = 'karaoke-dream', store = 'singer-profile') {
  const open = () => new Promise((resolve, reject) => {
    const rq = indexedDB.open(dbName, 1);
    rq.onupgradeneeded = () => rq.result.createObjectStore(store);
    rq.onsuccess = () => resolve(rq.result);
    rq.onerror = () => reject(rq.error);
  });
  return {
    async save(profile) {
      const db = await open();
      await new Promise((resolve, reject) => {
        const tx = db.transaction(store, 'readwrite');
        tx.objectStore(store).put(profile, 'default');
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error);
      });
      db.close();
    },
    async load() {
      const db = await open();
      const v = await new Promise((resolve, reject) => {
        const rq = db.transaction(store, 'readonly').objectStore(store).get('default');
        rq.onsuccess = () => resolve(rq.result || null);
        rq.onerror = () => reject(rq.error);
      });
      db.close();
      return v;
    }
  };
}

export async function saveProfile(driver, profile) { await driver.save(profile); return profile; }
export async function loadProfile(driver) { return (await driver.load()) || createProfile(); }

// Экспорт/импорт открытого контракта: экспортированный JSON на чистой вкладке
// даёт идентичное поведение коридора (критерий 3).
export function exportProfile(profile) { return JSON.stringify(profile, null, 2); }
export function importProfile(text) {
  const p = JSON.parse(text);
  if (p.version !== PROFILE_VERSION) throw new Error('Несовместимая версия профиля: ' + p.version);
  return p;
}
