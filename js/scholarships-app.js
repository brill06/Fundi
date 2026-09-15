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

const grid = document.querySelector('#cardsGrid');
const emptyState = document.querySelector('#emptyState');
const searchInput = document.querySelector('#searchInput');
const levelFilter = document.querySelector('#levelFilter');
const locationFilter = document.querySelector('#locationFilter');
const dateFilter = document.querySelector('#dateFilter');
const resultCount = document.querySelector('#resultCount');
const lastUpdated = document.querySelector('#lastUpdated');
let category = 'all';

function updateTabCounts() {
  const counts = { all: opportunities.length, Masters: 0, PhD: 0, Degree: 0, 'Short course': 0, Fellowship: 0 };
  opportunities.forEach(item => { if (counts[item.level] !== undefined) counts[item.level]++; });
  document.querySelectorAll('.tab:not(.job-tab)').forEach(tab => {
    const span = tab.querySelector('span');
    if (span) span.textContent = String(counts[tab.dataset.category] ?? 0).padStart(2, '0');
  });
}

function render() {
  const query = searchInput.value.trim().toLowerCase();
  const level = levelFilter.value;
  const location = locationFilter.value;
  const filtered = opportunities.filter(item => {
    const searchable = `${item.title} ${item.provider} ${item.place} ${item.level}`.toLowerCase();
    return (!query || searchable.includes(query)) && (level === 'all' || item.level === level) && (location === 'all' || item.location === location) && (dateFilter.value === 'all' || item.dateStatus === dateFilter.value) && (category === 'all' || item.level === category);
  });
  resultCount.textContent = filtered.length.toString().padStart(2, '0');
  grid.innerHTML = filtered.map(item => `<article class="scholarship-card"><div class="card-meta"><span class="type-tag">${item.level}</span><span class="location">${item.place}</span></div><h3>${item.title}</h3><p class="provider">${item.provider}</p><div class="date-row"><div>Opening<strong>${item.opening}</strong></div><div>Deadline<strong>${item.deadline}</strong></div></div><div class="card-bottom-row"><span class="status status-${item.dateStatus}">${item.dateStatus === 'open' ? 'Open now' : item.dateStatus === 'upcoming' ? 'Upcoming' : 'Rolling'}</span><a class="source-link" href="${item.url}" target="_blank" rel="noopener">Official source <span>↗</span></a></div></article>`).join('');
  emptyState.style.display = filtered.length ? 'none' : 'block';
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
  lastUpdated.textContent = 'Live data refreshed ' + d.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
}

updateTabCounts();
render();
