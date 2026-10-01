const DATA = window.GRANTS_DATA || { updated: null, items: [] };

function isDeadlinePassed(deadlineText) {
  if (!deadlineText) return false;
  if (/^(varies|rolling|see official|check university|no fixed|open enrolment)/i.test(deadlineText)) return false;
  const match = deadlineText.match(/([A-Za-z]+\s+\d{1,2},?\s+\d{4}|[A-Za-z]+\s+\d{4})/);
  if (!match) return false;
  const parsed = new Date(match[1]);
  if (isNaN(parsed)) return false;
  if (!/\d{1,2},?\s+\d{4}/.test(match[1])) {
    parsed.setMonth(parsed.getMonth() + 1, 0);
  }
  const today = new Date(); today.setHours(0, 0, 0, 0);
  return parsed < today;
}

const grants = (DATA.items || []).filter(item => !isDeadlinePassed(item.deadline));
const PROFILE_BADGE = { rotich: 'Rotich', brian: 'Brian', both: 'Both', other: 'Other' };

const grid = document.querySelector('#cardsGrid');
const emptyState = document.querySelector('#emptyState');
const searchInput = document.querySelector('#searchInput');
const audienceFilter = document.querySelector('#audienceFilter');
const locationFilter = document.querySelector('#locationFilter');
const dateFilter = document.querySelector('#dateFilter');
const resultCount = document.querySelector('#resultCount');
const lastUpdated = document.querySelector('#lastUpdated');
const savedToggle = document.querySelector('#savedToggle');
let audience = 'all';
let savedOnly = false;

function profileScoped() {
  const base = window.FundiProfile ? grants.filter(item => window.FundiProfile.matches(item)) : grants;
  return savedOnly && window.FundiSaved ? base.filter(item => window.FundiSaved.isSaved(item.url)) : base;
}

function updateTabCounts() {
  const scoped = profileScoped();
  const counts = { all: scoped.length, Personal: 0, Research: 0, 'CBOs & Small Orgs': 0 };
  scoped.forEach(item => { if (counts[item.audience] !== undefined) counts[item.audience]++; });
  document.querySelectorAll('.tab').forEach(tab => {
    const span = tab.querySelector('span');
    if (span) span.textContent = String(counts[tab.dataset.audience] ?? 0).padStart(2, '0');
  });
}

function render() {
  const query = searchInput.value.trim().toLowerCase();
  const aud = audienceFilter.value;
  const location = locationFilter.value;
  const filtered = profileScoped().filter(item => {
    const searchable = `${item.title} ${item.provider} ${item.place} ${item.audience} ${item.profileFit || ''}`;
    return (!query || (window.FundiSearch ? window.FundiSearch.matches(query, searchable) : searchable.toLowerCase().includes(query))) && (aud === 'all' || item.audience === aud) && (location === 'all' || item.location === location) && (dateFilter.value === 'all' || item.dateStatus === dateFilter.value) && (audience === 'all' || item.audience === audience);
  });
  resultCount.textContent = filtered.length.toString().padStart(2, '0');
  grid.innerHTML = filtered.map(item => `<article class="scholarship-card"${item.profileFit ? ` title="${item.profileFit.replace(/"/g, '&quot;')}"` : ''}><div class="card-meta"><span class="type-tag">${item.audience}</span><span class="location">${item.place}</span><button type="button" class="save-btn${window.FundiSaved && window.FundiSaved.isSaved(item.url) ? ' saved' : ''}" data-save-url="${item.url}" aria-pressed="${window.FundiSaved && window.FundiSaved.isSaved(item.url) ? 'true' : 'false'}">${window.FundiSaved && window.FundiSaved.isSaved(item.url) ? '★' : '☆'}</button></div><h3>${item.title}</h3><p class="provider">${item.provider}${item.profile ? ` · <em>${PROFILE_BADGE[item.profile] || 'Other'}</em>` : ''}</p><div class="date-row"><div>Opening<strong>${item.opening}</strong></div><div>Deadline<strong>${item.deadline}</strong></div></div><div class="card-bottom-row"><span class="status status-${item.dateStatus}">${item.dateStatus === 'open' ? 'Open now' : item.dateStatus === 'upcoming' ? 'Upcoming' : 'Rolling'}</span><a class="source-link" href="${item.url}" target="_blank" rel="noopener">Official source <span>↗</span></a></div></article>`).join('');
  emptyState.style.display = filtered.length ? 'none' : 'block';
  updateTabCounts();
}

[searchInput, audienceFilter, locationFilter, dateFilter].forEach(control => control.addEventListener('input', render));
document.querySelectorAll('.tab').forEach(tab => tab.addEventListener('click', () => {
  document.querySelector('.tab.active').classList.remove('active');
  tab.classList.add('active');
  audience = tab.dataset.audience;
  render();
}));

if (lastUpdated && DATA.updated) {
  const d = new Date(DATA.updated);
  lastUpdated.textContent = 'Hand-researched, last refreshed ' + d.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
}

if (savedToggle) {
  savedToggle.addEventListener('click', () => {
    savedOnly = !savedOnly;
    savedToggle.classList.toggle('active', savedOnly);
    savedToggle.setAttribute('aria-pressed', savedOnly ? 'true' : 'false');
    savedToggle.textContent = (savedOnly ? '★' : '☆') + ' Saved only';
    render();
  });
}
if (window.FundiSaved) window.FundiSaved.wireClicks(render);

window.renderFundi = render;
render();
