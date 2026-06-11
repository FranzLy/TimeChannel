/* ============================================================
   照片故事：写下当时的回忆，按时间线排列，存 IndexedDB
   通过 focus:photo / focus:opened / focus:closed 事件驱动
============================================================ */
import { fmtWhen } from '../config.js';
import { events } from '../events.js';
import { loadStories, migrateLocalStories, saveStoryList } from '../album/store.js';

const storyPanel = document.getElementById('storyPanel');
const storyList = document.getElementById('storyList');
const storyText = document.getElementById('storyText');

let stories = {};
migrateLocalStories()
  .then(() => loadStories())
  .then((loaded) => {
    stories = loaded;
    if (current?.id) renderStories(current.id);
  })
  .catch((err) => console.warn('story load failed:', err));

let current = null; // 正在查看的照片 { idx, id }

function renderStories(id) {
  storyList.innerHTML = '';
  const list = (id && stories[id]) ? [...stories[id]].sort((a, b) => a.t - b.t) : [];
  if (!list.length) {
    const empty = document.createElement('div');
    empty.className = 'sp-empty';
    empty.textContent = 'no story yet — write the first line';
    storyList.appendChild(empty);
    return;
  }
  for (const s of list) {
    const en = document.createElement('div'); en.className = 'sp-entry';
    const dot = document.createElement('div'); dot.className = 'dot';
    const when = document.createElement('div'); when.className = 'when'; when.textContent = fmtWhen(s.t);
    const tx = document.createElement('div'); tx.className = 'text'; tx.textContent = s.text;
    en.append(dot, when, tx);
    storyList.appendChild(en);
  }
  storyList.scrollTop = storyList.scrollHeight;
}

function submitStory() {
  if (!current?.id) return;
  const text = storyText.value.trim();
  if (!text) return;
  (stories[current.id] ??= []).push({ t: Date.now(), text });
  saveStoryList(current.id, stories[current.id]).catch((err) => console.warn('story save failed:', err));
  storyText.value = '';
  renderStories(current.id);
}

document.getElementById('storyAdd').addEventListener('click', submitStory);
storyText.addEventListener('keydown', (e) => {
  e.stopPropagation(); // 输入时不触发全局快捷键
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submitStory(); }
});

events.on('focus:opened', () => storyPanel.classList.add('open'));
events.on('focus:closed', () => { storyPanel.classList.remove('open'); current = null; });
events.on('focus:photo', ({ idx, id }) => {
  current = { idx, id };
  renderStories(id);
});
