/* ============================================================
   TimeChannel 装配与主循环
   数据流：album（唯一真源）→ events → tunnel / timeline / focus / panels
============================================================ */
import * as THREE from 'three';
import './style.css';
import { VERSION } from './config.js';
import { events } from './events.js';
import { camera, render } from './core/stage.js';
import { loadDefaultPhotos, attachDemoDates, loadPersistedAlbum } from './album/album.js';
import * as tunnel from './world/tunnel.js';
import * as sky from './world/sky.js';
import * as particles from './world/particles.js';
import * as meteors from './world/meteors.js';
import * as controls from './interact/controls.js';
import * as hover from './interact/hover.js';
import * as focus from './interact/focus.js';
import * as timeline from './ui/timeline.js';
import './ui/story.js';
import './ui/panels.js';
import './ui/hint.js';

console.log(`%cTimeChannel ${VERSION}`, 'color:#ffe4c3');

/* ---------- 相册变更：顺序敏感，集中编排 ---------- */
events.on('album:changed', () => {
  tunnel.onAlbumChanged(); // 先重铺照片（重置游标后的索引）
  focus.forceClose();      // 再收起聚焦（恢复成新铺的纹理）
  timeline.rebuild();      // 最后重建时间轴
});

/* ---------- 调试句柄 ---------- */
window.__tc = { meteors: meteors.meteors, spawnMeteor: meteors.spawnMeteor, camera };
window.__tcFocus = () => focus.debugState();

/* ---------- 主循环 ---------- */
const clock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);
  const t = clock.elapsedTime;

  controls.update(dt, t);                                        // 行进 + 相机
  tunnel.update(dt, t, Math.abs(controls.controls.velocity));    // 环旋转/回收/路标
  hover.update();                                                // 悬停检测
  tunnel.updateCards(dt, t, hover.getHovered());                 // 卡片贴墙漂浮
  focus.update(dt, t);                                           // 聚焦覆盖 + 暗幕 + 辉光
  sky.update(dt, t);                                             // 星云/配色/尽头的光
  particles.update(dt, t);                                       // 光尘/星空
  meteors.update(dt, t);                                         // 流星
  timeline.update();                                             // HUD + 滑块
  render(t);
}

/* ---------- 启动 ---------- */
loadPersistedAlbum().then(async (hasPersistedAlbum) => {
  if (!hasPersistedAlbum) {
    await loadDefaultPhotos();
    attachDemoDates();
  }
  timeline.rebuild();
  tunnel.buildTunnel();
  animate();
  document.getElementById('loader').classList.add('done');
});
