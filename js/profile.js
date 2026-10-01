(function () {
  const KEY = 'fundiProfile';
  const LABELS = { all: 'Everyone', rotich: 'Miss Rotich', brian: 'Mr. Brian', other: 'Other / FYI' };

  function get() {
    try { return localStorage.getItem(KEY) || 'all'; } catch (e) { return 'all'; }
  }

  function set(profile) {
    try { localStorage.setItem(KEY, profile); } catch (e) { /* storage unavailable, fall through silently */ }
  }

  function matches(item) {
    const profile = get();
    if (profile === 'all') return true;
    const tag = item.profile || 'other';
    if (profile === 'other') return tag === 'other';
    return tag === profile || tag === 'both';
  }

  function labelFor(profile) {
    return LABELS[profile] || LABELS.all;
  }

  function wire() {
    const bar = document.querySelector('.profile-bar');
    if (!bar) return;
    const buttons = Array.from(bar.querySelectorAll('[data-profile]'));
    const active = get();

    function paint(profile) {
      buttons.forEach(b => b.classList.toggle('active', b.dataset.profile === profile));
      document.querySelectorAll('[data-profile-label]').forEach(el => { el.textContent = labelFor(profile); });
    }

    buttons.forEach(btn => {
      btn.addEventListener('click', () => {
        set(btn.dataset.profile);
        paint(btn.dataset.profile);
        if (typeof window.renderFundi === 'function') window.renderFundi();
      });
    });

    paint(active);
  }

  window.FundiProfile = { get, set, matches, labelFor, wire };
  document.addEventListener('DOMContentLoaded', wire);
})();
