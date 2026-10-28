// Минимальная шина событий. Всё общение между модулями UI и логикой — через неё.
export class EventBus {
  constructor() {
    this.map = new Map();
  }
  on(event, fn) {
    if (!this.map.has(event)) this.map.set(event, new Set());
    this.map.get(event).add(fn);
    return () => this.off(event, fn);
  }
  off(event, fn) {
    this.map.get(event)?.delete(fn);
  }
  emit(event, data) {
    this.map.get(event)?.forEach((fn) => {
      try { fn(data); } catch (err) { console.error(`[bus:${event}]`, err); }
    });
  }
}

export const bus = new EventBus();
