/* ============================================================
   全局配置与纯函数（无依赖）
============================================================ */
export const VERSION = 'v9';

export const isMobile =
  /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || window.innerWidth < 640;

export const CFG = {
  rings: isMobile ? 26 : 34,        // 同时存在的照片环数
  segments: isMobile ? 10 : 12,     // 每环照片数
  spacing: 9,                       // 环间距
  radius: 14,                       // 隧道半径
  photoW: 6.6, photoH: 4.7,
  photoCount: 48,                   // 默认照片数量
  maxSpeed: 60,
};

export const TUNNEL_LEN = CFG.rings * CFG.spacing;

export const REACH = 60; // 可悬停/点击的最远距离

/* ---------- 弯道：隧道沿 z 蜿蜒，穿行更有穿梭感 ---------- */
export function curveX(z) { return Math.sin(z * 0.020) * 5.5 + Math.sin(z * 0.0083) * 3.5; }
export function curveY(z) { return Math.sin(z * 0.013 + 2.0) * 3.0; }

/* ---------- 日期格式 ---------- */
export const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];

export function fmtDate(d) { return `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`; }

export function fmtWhen(ts) {
  const d = new Date(ts);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${fmtDate(d)} · ${hh}:${mm}`;
}
