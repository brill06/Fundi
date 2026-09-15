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

const scholarships = ((window.SCHOLARSHIPS_DATA || {}).items || []).filter(i => !isDeadlinePassed(i.deadline));
const jobs = ((window.JOBS_DATA || {}).items || []).filter(i => !isDeadlinePassed(i.deadline));
const grants = ((window.GRANTS_DATA || {}).items || []).filter(i => !isDeadlinePassed(i.deadline));

const STOPWORDS = new Set(['i','am','a','an','the','in','on','for','of','and','or','to','with','is','are','my','me','be','it','at','as','by','looking','look','want','wants','wanted','need','needs','currently','background','please','can','you','help','find','some','any','that','this','have','has','had','been','from','who','what','fits','fit','suited','suitable','like','also','get','into','out','about'].concat(
  ['study','studies','studying','studied','opportunity','opportunities','options','option','available']
));

function tokenize(text) {
  return text.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(w => w.length > 2 && !STOPWORDS.has(w));
}

function detectLevelIntent(message) {
  const m = message.toLowerCase();
  const mentionsPhd = /\bphd\b|doctoral|doctorate/.test(m);
  const mentionsMasters = /master'?s|\bmsc\b|\bm\.a\.\b|\bmba\b/.test(m);
  const mentionsUndergrad = /undergrad|bachelor|\bbsc\b/.test(m);
  // Mentioning both Masters and PhD in one message almost always means "I have/am
  // finishing a Masters, I want PhD listings" rather than "show me both levels".
  if (mentionsPhd) return { want: 'PhD', exclude: mentionsMasters ? 'Masters' : null };
  if (mentionsMasters) return { want: 'Masters', exclude: null };
  if (mentionsUndergrad) return { want: 'Degree', exclude: null };
  return { want: null, exclude: null };
}

function detectIntents(message) {
  const m = message.toLowerCase();
  const wantsScholarships = /scholarship|fellowship|phd|master|msc|bursary|academic|research degree|study/.test(m);
  const wantsJobs = /\bjob|work|career|employ|role|hire|hiring|task|gig|annotat|label(l)?ing\b/.test(m);
  const wantsGrants = /grant|funding|fund\b|cbo|ngo|nonprofit|non-profit|project fund|community fund|small org|startup/.test(m);
  if (!wantsScholarships && !wantsJobs && !wantsGrants) return { scholarships: true, jobs: true, grants: true };
  return { scholarships: wantsScholarships, jobs: wantsJobs, grants: wantsGrants };
}

function detectAiTaskIntent(message) {
  return /\bai (task|training|data)|data (annotation|labeling|labelling)|\bannotat|\brlhf\b|remote (micro)?task|crowd(work|task)/i.test(message);
}

function wordsMatch(a, b) {
  if (a === b) return true;
  const minLen = Math.min(a.length, b.length);
  if (minLen < 3) return false;
  const prefixLen = Math.min(minLen, 4);
  return a.slice(0, prefixLen) === b.slice(0, prefixLen);
}

function scoreItem(tokens, searchableText) {
  const hayWords = searchableText.toLowerCase().split(/[^a-z0-9]+/).filter(w => w.length > 2);
  let score = 0;
  tokens.forEach(t => { if (hayWords.some(w => wordsMatch(w, t))) score += 1; });
  return score;
}

function rankScholarships(tokens, levelIntent, limit) {
  const scored = scholarships.map(item => {
    let score = scoreItem(tokens, `${item.title} ${item.provider} ${item.place} ${item.level}`);
    if (levelIntent.want && item.level === levelIntent.want) score += 5;
    if (levelIntent.exclude && item.level === levelIntent.exclude) score -= 4;
    return { item, score };
  }).filter(s => s.score > 0 || (levelIntent.want && s.item.level === levelIntent.want));
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map(s => s.item);
}

const AI_TASK_PROVIDERS = new Set(['Sama', 'Appen', 'Toloka', 'Clickworker', 'Remotasks']);

function rankJobs(tokens, message, limit) {
  const wantsAiTasks = detectAiTaskIntent(message);
  const scored = jobs.map(item => {
    let score = scoreItem(tokens, `${item.title} ${item.provider} ${item.place} ${item.mode}`);
    if (wantsAiTasks && AI_TASK_PROVIDERS.has(item.provider)) score += 5;
    return { item, score };
  }).filter(s => s.score > 0);
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map(s => s.item);
}

function isNegated(message, keywordPattern) {
  // Cheap negation check: "not for an organisation" shouldn't count as an org signal.
  const re = new RegExp(`\\b(not|no|isn'?t|instead of)\\b[^.,;!?]{0,20}(${keywordPattern})`, 'i');
  return re.test(message);
}

function rankGrants(tokens, message, limit) {
  const wantsResearch = /research/i.test(message);
  const wantsPersonal = /\b(personal|individual|myself|freelance)\b/i.test(message);
  const orgPattern = "\\bcbo\\b|ngo|nonprofit|non-profit|small org|startup|organi[sz]ation|community group";
  const wantsOrg = new RegExp(orgPattern, 'i').test(message) && !isNegated(message, orgPattern);
  const scored = grants.map(item => {
    let score = scoreItem(tokens, `${item.title} ${item.provider} ${item.place} ${item.audience}`);
    if (wantsResearch && item.audience === 'Research') score += 3;
    if (wantsPersonal && item.audience === 'Personal') score += 3;
    if (wantsOrg && item.audience === 'CBOs & Small Orgs') score += 3;
    return { item, score };
  }).filter(s => s.score > 0);
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map(s => s.item);
}

function renderResultRow(item, badge) {
  return `<div class="chat-result"><a href="${item.url}" target="_blank" rel="noopener">${item.title}</a><span>${badge} · ${item.place}</span></div>`;
}

function buildReply(message) {
  const tokens = tokenize(message);
  const levelIntent = detectLevelIntent(message);
  const intents = detectIntents(message);

  const scholarshipMatches = intents.scholarships ? rankScholarships(tokens, levelIntent, 4) : [];
  const jobMatches = intents.jobs ? rankJobs(tokens, message, 4) : [];
  const grantMatches = intents.grants ? rankGrants(tokens, message, 4) : [];

  const totalMatches = scholarshipMatches.length + jobMatches.length + grantMatches.length;

  if (totalMatches === 0) {
    return `<p>I couldn't find a close match for that in the current listings (all open to Kenyan applicants). Try naming your field of study, current level (e.g. "finishing a Masters"), and whether you want a scholarship, a job (including remote AI data-work tasks), or funding (personal, research, or for a CBO/small org) — or browse <a href="scholarships.html">Scholarships</a>, <a href="jobs.html">Jobs</a> and <a href="grants.html">Grants</a> directly.</p>`;
  }

  let html = `<p>Here's what looks closest to that, from the live listings:</p>`;
  if (scholarshipMatches.length) {
    html += `<h4>Scholarships &amp; fellowships</h4>` + scholarshipMatches.map(i => renderResultRow(i, i.level)).join('');
  }
  if (jobMatches.length) {
    html += `<h4>Jobs</h4>` + jobMatches.map(i => renderResultRow(i, i.mode)).join('');
  }
  if (grantMatches.length) {
    html += `<h4>Grants &amp; funding</h4>` + grantMatches.map(i => renderResultRow(i, i.audience)).join('');
  }
  html += `<p style="margin-top:14px;font-size:11.5px;color:var(--muted)">Always confirm eligibility and deadlines on the official source page before applying.</p>`;
  return html;
}

const chatLog = document.querySelector('#chatLog');
const chatForm = document.querySelector('#chatForm');
const chatInput = document.querySelector('#chatInput');
const chatSuggestions = document.querySelector('#chatSuggestions');

function addMessage(html, from) {
  const el = document.createElement('div');
  el.className = `chat-msg from-${from}`;
  el.innerHTML = html;
  chatLog.appendChild(el);
  chatLog.scrollTop = chatLog.scrollHeight;
}

function escapeHtml(text) {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function handleSend(text) {
  const trimmed = text.trim();
  if (!trimmed) return;
  addMessage(`<p>${escapeHtml(trimmed)}</p>`, 'user');
  addMessage(buildReply(trimmed), 'fundi');
  chatInput.value = '';
  if (chatSuggestions) chatSuggestions.style.display = 'none';
}

chatForm.addEventListener('submit', e => {
  e.preventDefault();
  handleSend(chatInput.value);
});

chatSuggestions.querySelectorAll('.chip').forEach(chip => {
  chip.addEventListener('click', () => handleSend(chip.textContent));
});

addMessage(`<p>Tell me about your field, your current level of study, and what you're after — a scholarship, a job (remote AI data-work tasks included), or funding (personal, research, or for a CBO/small org) — and I'll shortlist matches from the live listings, all open to Kenyan applicants.</p>`, 'fundi');
