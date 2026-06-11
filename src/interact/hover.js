/* ============================================================
   悬停：照片浮出 + 相框增亮 + 日期提示（桌面端）
============================================================ */
import * as THREE from 'three';
import { REACH, isMobile, fmtDate } from '../config.js';
import { camera, canvas } from '../core/stage.js';
import { photoMeshes, frameMat, frameHoverMat } from '../world/tunnel.js';
import { photoItems } from '../album/album.js';
import { isFocused } from './focus.js';
import { controls } from './controls.js';
import { events } from '../events.js';

const raycaster = new THREE.Raycaster();
const _ndc = new THREE.Vector2();
const tip = document.getElementById('tip');

let hoveredCard = null;

export function getHovered() { return hoveredCard; }

function setHovered(card) {
  if (card === hoveredCard) return;
  if (hoveredCard) hoveredCard.userData.frameMesh.material = frameMat;
  hoveredCard = card;
  if (hoveredCard) {
    hoveredCard.userData.frameMesh.material = frameHoverMat;
    const d = photoItems[hoveredCard.userData.photoMesh.userData.photoIndex]?.date;
    tip.textContent = d ? fmtDate(d) : '';
  }
  tip.classList.toggle('show', !!hoveredCard);
  canvas.style.cursor = hoveredCard ? 'pointer' : '';
}

// 取出照片时清掉悬停态
events.on('focus:opened', () => setHovered(null));

export function update() {
  if (!isMobile && controls.pointerActive && !controls.dragging && !isFocused()) {
    raycaster.setFromCamera(_ndc.set(controls.pointer.x, controls.pointer.y), camera);
    const hits = raycaster.intersectObjects(photoMeshes, false);
    setHovered(hits.length && hits[0].distance < REACH ? hits[0].object.parent : null);
  } else if (hoveredCard) {
    setHovered(null);
  }
  if (hoveredCard) {
    tip.style.left = controls.tipX + 'px';
    tip.style.top = controls.tipY + 'px';
  }
}
