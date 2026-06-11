/* ============================================================
   底部操作提示：首次交互后淡出
============================================================ */
import { events } from '../events.js';

const hint = document.getElementById('hint');
let hidden = false;

events.on('interacted', () => {
  if (hidden) return;
  hidden = true;
  setTimeout(() => hint.classList.add('hidden'), 1500);
});
