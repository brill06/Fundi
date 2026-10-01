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
const PROFILE_BADGE = { rotich: 'Rotich', brian: 'Brian', both: 'Both', other: 'Other' };

const jobsGrid = document.querySelector('#jobsGrid');
const jobsEmptyState = document.querySelector('#jobsEmptyState');
const jobSearchInput = document.querySelector('#jobSearchInput');
const jobLocationFilter = document.querySelector('#jobLocationFilter');
const modeFilter = document.querySelector('#modeFilter');
const resultCount = document.querySelector('#resultCount');
const lastUpdated = document.querySelector('#lastUpdated');
const savedToggle = document.querySelector('#savedToggle');
let jobMode = 'all';
let savedOnly = false;

function profileScoped() {
  const base = window.FundiProfile ? jobs.filter(item => window.FundiProfile.matches(item)) : jobs;
  return savedOnly && window.FundiSaved ? base.filter(item => window.FundiSaved.isSaved(item.url)) : base;
}

function updateTabCounts() {
  const scoped = profileScoped();
  const counts = { all: scoped.length, Remote: 0, Hybrid: 0, Onsite: 0 };
  scoped.forEach(item => { if (counts[item.mode] !== undefined) counts[item.mode]++; });
  document.querySelectorAll('.job-tab').forEach(tab => {
    const span = tab.querySelector('span');
    if (span) span.textContent = String(counts[tab.dataset.mode] ?? 0).padStart(2, '0');
  });
}

function renderJobs() {
  const query = jobSearchInput.value.trim().toLowerCase();
  const location = jobLocationFilter.value;
  const mode = modeFilter.value;
  const filtered = profileScoped().filter(item => {
    const searchable = `${item.title} ${item.provider} ${item.place} ${item.mode} ${item.profileFit || ''}`;
    return (!query || (window.FundiSearch ? window.FundiSearch.matches(query, searchable) : searchable.toLowerCase().includes(query))) && (location === 'all' || item.location === location) && (mode === 'all' || item.mode === mode) && (jobMode === 'all' || item.mode === jobMode);
  });
  if (resultCount) resultCount.textContent = filtered.length.toString().padStart(2, '0');
  jobsGrid.innerHTML = filtered.map(item => `<article class="scholarship-card job-card"${item.profileFit ? ` title="${item.profileFit.replace(/"/g, '&quot;')}"` : ''}><div class="card-meta"><span class="type-tag type-job">${item.mode}</span><span class="location">${item.place}</span><button type="button" class="save-btn${window.FundiSaved && window.FundiSaved.isSaved(item.url) ? ' saved' : ''}" data-save-url="${item.url}" aria-pressed="${window.FundiSaved && window.FundiSaved.isSaved(item.url) ? 'true' : 'false'}">${window.FundiSaved && window.FundiSaved.isSaved(item.url) ? '★' : '☆'}</button></div><h3>${item.title}</h3><p class="provider">${item.provider}${item.profile ? ` · <em>${PROFILE_BADGE[item.profile] || 'Other'}</em>` : ''}</p><div class="date-row"><div>Opening<strong>${item.opening}</strong></div><div>Closing<strong>${item.deadline}</strong></div></div><div class="card-bottom-row"><span class="job-location-label">${item.location === 'Kenya' ? 'Kenya opportunity' : item.location === 'Africa' ? 'Africa opportunity' : 'Global applicants'}</span><a class="source-link" href="${item.url}" target="_blank" rel="noopener">View source <span>↗</span></a></div></article>`).join('');
  jobsEmptyState.style.display = filtered.length ? 'none' : 'block';
  updateTabCounts();
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
  lastUpdated.textContent = 'Hand-researched, last refreshed ' + d.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
}

if (savedToggle) {
  savedToggle.addEventListener('click', () => {
    savedOnly = !savedOnly;
    savedToggle.classList.toggle('active', savedOnly);
    savedToggle.setAttribute('aria-pressed', savedOnly ? 'true' : 'false');
    savedToggle.textContent = (savedOnly ? '★' : '☆') + ' Saved only';
    renderJobs();
  });
}
if (window.FundiSaved) window.FundiSaved.wireClicks(renderJobs);

window.renderFundi = renderJobs;
renderJobs();
