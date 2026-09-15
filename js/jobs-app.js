const DATA = window.JOBS_DATA || { updated: null, items: [] };

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

const jobs = (DATA.items || []).filter(item => !isDeadlinePassed(item.deadline));

const jobsGrid = document.querySelector('#jobsGrid');
const jobsEmptyState = document.querySelector('#jobsEmptyState');
const jobSearchInput = document.querySelector('#jobSearchInput');
const jobLocationFilter = document.querySelector('#jobLocationFilter');
const modeFilter = document.querySelector('#modeFilter');
const resultCount = document.querySelector('#resultCount');
const lastUpdated = document.querySelector('#lastUpdated');
let jobMode = 'all';

function updateTabCounts() {
  const counts = { all: jobs.length, Remote: 0, Hybrid: 0, Onsite: 0 };
  jobs.forEach(item => { if (counts[item.mode] !== undefined) counts[item.mode]++; });
  document.querySelectorAll('.job-tab').forEach(tab => {
    const span = tab.querySelector('span');
    if (span) span.textContent = String(counts[tab.dataset.mode] ?? 0).padStart(2, '0');
  });
}

function renderJobs() {
  const query = jobSearchInput.value.trim().toLowerCase();
  const location = jobLocationFilter.value;
  const mode = modeFilter.value;
  const filtered = jobs.filter(item => {
    const searchable = `${item.title} ${item.provider} ${item.place} ${item.mode}`.toLowerCase();
    return (!query || searchable.includes(query)) && (location === 'all' || item.location === location) && (mode === 'all' || item.mode === mode) && (jobMode === 'all' || item.mode === jobMode);
  });
  if (resultCount) resultCount.textContent = filtered.length.toString().padStart(2, '0');
  jobsGrid.innerHTML = filtered.map(item => `<article class="scholarship-card job-card"><div class="card-meta"><span class="type-tag type-job">${item.mode}</span><span class="location">${item.place}</span></div><h3>${item.title}</h3><p class="provider">${item.provider}</p><div class="date-row"><div>Opening<strong>${item.opening}</strong></div><div>Closing<strong>${item.deadline}</strong></div></div><div class="card-bottom-row"><span class="job-location-label">${item.location === 'Kenya' ? 'Kenya opportunity' : 'Global applicants'}</span><a class="source-link" href="${item.url}" target="_blank" rel="noopener">View source <span>↗</span></a></div></article>`).join('');
  jobsEmptyState.style.display = filtered.length ? 'none' : 'block';
}

[jobSearchInput, jobLocationFilter, modeFilter].forEach(control => control.addEventListener('input', renderJobs));
document.querySelectorAll('.job-tab').forEach(tab => tab.addEventListener('click', () => {
  document.querySelector('.job-tab.active').classList.remove('active');
  tab.classList.add('active');
  jobMode = tab.dataset.mode;
  renderJobs();
}));

if (lastUpdated && DATA.updated) {
  const d = new Date(DATA.updated);
  lastUpdated.textContent = 'Live data refreshed ' + d.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
}

updateTabCounts();
renderJobs();
