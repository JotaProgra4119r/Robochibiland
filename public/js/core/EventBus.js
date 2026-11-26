// Centralized Publish/Subscribe EventBus for decoupled subsystem communication

export class EventBus {
  constructor() {
    this._listeners = new Map();
  }

  /**
   * Subscribe to an event. Returns an unsubscribe function.
   */
  on(ev, fn) {
    if (typeof fn !== 'function') return () => {};
    let list = this._listeners.get(ev);
    if (!list) {
      list = [];
      this._listeners.set(ev, list);
    }
    if (!list.includes(fn)) {
      list.push(fn);
    }
    return () => this.off(ev, fn);
  }

  /**
   * Subscribe to an event for a single emission. Returns an unsubscribe function.
   */
  once(ev, fn) {
    if (typeof fn !== 'function') return () => {};
    const wrapper = (payload) => {
      this.off(ev, wrapper);
      fn(payload);
    };
    wrapper._originalFn = fn;
    return this.on(ev, wrapper);
  }

  /**
   * Unsubscribe a listener from an event.
   */
  off(ev, fn) {
    const list = this._listeners.get(ev);
    if (!list) return;
    for (let i = list.length - 1; i >= 0; i--) {
      if (list[i] === fn || list[i]._originalFn === fn) {
        list.splice(i, 1);
      }
    }
    if (list.length === 0) {
      this._listeners.delete(ev);
    }
  }

  /**
   * Emit an event synchronously with zero allocation when no listeners exist.
   */
  emit(ev, payload) {
    const list = this._listeners.get(ev);
    if (!list || list.length === 0) return;
    // Iterate backwards-safe or index-guarded in case a listener removes itself (once)
    for (let i = 0; i < list.length; i++) {
      const fn = list[i];
      if (!fn) continue;
      const prevLen = list.length;
      try {
        fn(payload);
      } catch (err) {
        console.error(`[EventBus] Error in listener for "${ev}":`, err);
      }
      if (list.length < prevLen) {
        i -= (prevLen - list.length);
      }
    }
  }

  /**
   * Remove all listeners across all events.
   */
  clear() {
    this._listeners.clear();
  }
}

export const eventBus = new EventBus();
