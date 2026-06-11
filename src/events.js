/* ============================================================
   极简事件总线：模块间解耦（album:changed / focus:* / cruise:changed / interacted）
============================================================ */
const listeners = new Map();

export const events = {
  on(type, fn) {
    if (!listeners.has(type)) listeners.set(type, []);
    listeners.get(type).push(fn);
  },
  emit(type, data) {
    const fns = listeners.get(type);
    if (fns) for (const fn of fns) fn(data);
  },
};
