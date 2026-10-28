// «Зелёный коридор» — сингулярное отличие проекта.
// Среда не требует от вектора соответствия тренду: при просадках сцена
// транспонируется К певцу (детюн), при уверенном росте возвращается к оригиналу.
// Чистая логика: политика решений, без DOM/Audio.

export function createCorridor({ maxShift = 3, downAt = 55, upAt = 82, window = 3 } = {}) {
  return {
    shift: 0,       // текущее смещение в полутонах (минус = среда идёт к певцу)
    history: [],    // последние оценки строк
    events: [],     // журнал событий для экрана результата
    maxShift,
    downAt,
    upAt,
    window,
  };
}

// Чем глубже коридор, тем шире допуск оценки (среда становится добрее).
export function corridorTol(corridor) {
  return 1 + 0.22 * Math.max(0, -corridor.shift);
}

export function updateCorridor(corridor, score) {
  corridor.history.push(score);
  if (corridor.history.length > corridor.window) corridor.history.shift();
  const avg = corridor.history.reduce((a, b) => a + b, 0) / corridor.history.length;

  let event = null;
  if (avg < corridor.downAt && corridor.shift > -corridor.maxShift) {
    corridor.shift -= 1;
    event = { type: 'down', shift: corridor.shift, avg: Math.round(avg) };
  } else if (avg > corridor.upAt && corridor.shift < 0) {
    corridor.shift += 1;
    event = { type: 'up', shift: corridor.shift, avg: Math.round(avg) };
  }
  if (event) corridor.events.push({ ...event, at: corridor.events.length });
  return event;
}

export function corridorLabel(corridor) {
  if (!corridor.shift) return 'оригинал';
  return corridor.shift > 0 ? `+${corridor.shift} пт` : `${corridor.shift} пт`;
}
