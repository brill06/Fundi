const DATA = window.SCHOLARSHIPS_DATA || { updated: null, items: [] };

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

const opportunities = (DATA.items || []).filter(item => !isDeadlinePassed(item.deadline));

const TAB_GROUPS = { PhD: ['PhD', 'Postdoc'], Training: ['Short course', 'Certification'] };
function levelInGroup(level, groupKey) {
  return TAB_GROUPS[groupKey] ? TAB_GROUPS[groupKey].includes(level) : level === groupKey;
}
const PROFILE_BADGE = { rotich: 'Rotich', brian: 'Brian', both: 'Both', other: 'Other' };

const grid = document.querySelector('#cardsGrid');
const emptyState = document.querySelector('#emptyState');
const searchInput = document.querySelector('#searchInput');
const levelFilter = document.querySelector('#levelFilter');
const locationFilter = document.querySelector('#locationFilter');
const dateFilter = document.querySelector('#dateFilter');
const resultCount = document.querySelector('#resultCount');
const lastUpdated = document.querySelector('#lastUpdated');
const savedToggle = document.querySelector('#savedToggle');
let category = 'all';
let savedOnly = false;

function profileScoped() {
  const base = window.FundiProfile ? opportunities.filter(item => window.FundiProfile.matches(item)) : opportunities;
  return savedOnly && window.FundiSaved ? base.filter(item => window.FundiSaved.isSaved(item.url)) : base;
}

function updateTabCounts() {
  const scoped = profileScoped();
  const counts = { all: scoped.length, Masters: 0, PhD: 0, Fellowship: 0, Training: 0 };
  scoped.forEach(item => {
    Object.keys(counts).forEach(key => { if (key !== 'all' && levelInGroup(item.level, key)) counts[key]++; });
  });
  document.querySelectorAll('.tab:not(.job-tab)').forEach(tab => {
    const span = tab.querySelector('span');
    if (span) span.textContent = String(counts[tab.dataset.category] ?? 0).padStart(2, '0');
  });
}

function render() {
  const query = searchInput.value.trim().toLowerCase();
  const level = levelFilter.value;
  const location = locationFilter.value;
  const filtered = profileScoped().filter(item => {
    const searchable = `${item.title} ${item.provider} ${item.place} ${item.level} ${item.profileFit || ''}`;
    return (!query || (window.FundiSearch ? window.FundiSearch.matches(query, searchable) : searchable.toLowerCase().includes(query))) && (level === 'all' || item.level === level) && (location === 'all' || item.location === location) && (dateFilter.value === 'all' || item.dateStatus === dateFilter.value) && (category === 'all' || levelInGroup(item.level, category));
  });
  resultCount.textContent = filtered.length.toString().padStart(2, '0');
  grid.innerHTML = filtered.map(item => `<article class="scholarship-card"${item.profileFit ? ` title="${item.profileFit.replace(/"/g, '&quot;')}"` : ''}><div class="card-meta"><span class="type-tag">${item.level}</span><span class="location">${item.place}</span><button type="button" class="save-btn${window.FundiSaved && window.FundiSaved.isSaved(item.url) ? ' saved' : ''}" data-save-url="${item.url}" aria-pressed="${window.FundiSaved && window.FundiSaved.isSaved(item.url) ? 'true' : 'false'}">${window.FundiSaved && window.FundiSaved.isSaved(item.url) ? '★' : '☆'}</button></div><h3>${item.title}</h3><p class="provider">${item.provider}${item.profile ? ` · <em>${PROFILE_BADGE[item.profile] || 'Other'}</em>` : ''}</p><div class="date-row"><div>Opening<strong>${item.opening}</strong></div><div>Deadline<strong>${item.deadline}</strong></div></div><div class="card-bottom-row"><span class="status status-${item.dateStatus}">${item.dateStatus === 'open' ? 'Open now' : item.dateStatus === 'upcoming' ? 'Upcoming' : 'Rolling'}</span><a class="source-link" href="${item.url}" target="_blank" rel="noopener">Official source <span>↗</span></a></div></article>`).join('');
  emptyState.style.display = filtered.length ? 'none' : 'block';
  updateTabCounts();
}

[searchInput, levelFilter, locationFilter, dateFilter].forEach(control => control.addEventListener('input', render));
document.querySelectorAll('.tab:not(.job-tab)').forEach(tab => tab.addEventListener('click', () => {
  document.querySelector('.tab:not(.job-tab).active').classList.remove('active');
  tab.classList.add('active');
  category = tab.dataset.category;
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
