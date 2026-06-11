/* ============================================================
   左下角进度/提示
============================================================ */
const toast = document.getElementById('toast');
let toastTimer = null;

export function showToast(text, sticky = false) {
  toast.textContent = text;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  if (!sticky) toastTimer = setTimeout(() => toast.classList.remove('show'), 2600);
}
