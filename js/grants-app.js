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

const grid = document.querySelector('#cardsGrid');
const emptyState = document.querySelector('#emptyState');
const searchInput = document.querySelector('#searchInput');
const audienceFilter = document.querySelector('#audienceFilter');
const locationFilter = document.querySelector('#locationFilter');
const dateFilter = document.querySelector('#dateFilter');
const resultCount = document.querySelector('#resultCount');
const lastUpdated = document.querySelector('#lastUpdated');
let audience = 'all';

function updateTabCounts() {
  const counts = { all: grants.length, 'CBOs & NGOs': 0, Researchers: 0, 'Community groups': 0, Individuals: 0, 'Organisations & individuals': 0 };
  grants.forEach(item => { if (counts[item.audience] !== undefined) counts[item.audience]++; });
  document.querySelectorAll('.tab').forEach(tab => {
    const span = tab.querySelector('span');
    if (span) span.textContent = String(counts[tab.dataset.audience] ?? 0).padStart(2, '0');
  });
}

function render() {
  const query = searchInput.value.trim().toLowerCase();
  const aud = audienceFilter.value;
  const location = locationFilter.value;
  const filtered = grants.filter(item => {
    const searchable = `${item.title} ${item.provider} ${item.place} ${item.audience}`.toLowerCase();
    return (!query || searchable.includes(query)) && (aud === 'all' || item.audience === aud) && (location === 'all' || item.location === location) && (dateFilter.value === 'all' || item.dateStatus === dateFilter.value) && (audience === 'all' || item.audience === audience);
  });
  resultCount.textContent = filtered.length.toString().padStart(2, '0');
  grid.innerHTML = filtered.map(item => `<article class="scholarship-card"><div class="card-meta"><span class="type-tag">${item.audience}</span><span class="location">${item.place}</span></div><h3>${item.title}</h3><p class="provider">${item.provider}</p><div class="date-row"><div>Opening<strong>${item.opening}</strong></div><div>Deadline<strong>${item.deadline}</strong></div></div><div class="card-bottom-row"><span class="status status-${item.dateStatus}">${item.dateStatus === 'open' ? 'Open now' : item.dateStatus === 'upcoming' ? 'Upcoming' : 'Rolling'}</span><a class="source-link" href="${item.url}" target="_blank" rel="noopener">Official source <span>↗</span></a></div></article>`).join('');
  emptyState.style.display = filtered.length ? 'none' : 'block';
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
  lastUpdated.textContent = 'Live data refreshed ' + d.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
}

updateTabCounts();
render();
