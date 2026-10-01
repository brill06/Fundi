(function () {
  const KEY = 'fundiSaved';

  function getAll() {
    try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch (e) { return []; }
  }

  function isSaved(url) {
    return getAll().indexOf(url) !== -1;
  }

  function toggle(url) {
    const list = getAll();
    const idx = list.indexOf(url);
    if (idx === -1) list.push(url); else list.splice(idx, 1);
    try { localStorage.setItem(KEY, JSON.stringify(list)); } catch (e) { /* storage unavailable */ }
    return idx === -1;
  }

  function paintButton(btn, saved) {
    btn.classList.toggle('saved', saved);
    btn.setAttribute('aria-pressed', saved ? 'true' : 'false');
    btn.textContent = saved ? '★' : '☆';
    btn.title = saved ? 'Saved — click to remove' : 'Save for later';
  }

  function paintCount() {
    const n = getAll().length;
    document.querySelectorAll('[data-saved-count]').forEach(el => { el.textContent = String(n); });
    document.querySelectorAll('[data-saved-indicator]').forEach(el => { el.hidden = n === 0; });
  }

  function wireClicks(onChange) {
    document.addEventListener('click', e => {
      const btn = e.target.closest('[data-save-url]');
      if (!btn) return;
      e.preventDefault();
      e.stopPropagation();
      const nowSaved = toggle(btn.dataset.saveUrl);
      paintButton(btn, nowSaved);
      paintCount();
      if (typeof onChange === 'function') onChange();
    });
  }

  document.addEventListener('DOMContentLoaded', paintCount);

  window.FundiSaved = { getAll, isSaved, toggle, paintButton, paintCount, wireClicks };
})();
