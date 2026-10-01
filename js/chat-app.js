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

const allScholarships = ((window.SCHOLARSHIPS_DATA || {}).items || []).filter(i => !isDeadlinePassed(i.deadline));
const allJobs = ((window.JOBS_DATA || {}).items || []).filter(i => !isDeadlinePassed(i.deadline));
const allGrants = ((window.GRANTS_DATA || {}).items || []).filter(i => !isDeadlinePassed(i.deadline));

function profileScoped(list) {
  return window.FundiProfile ? list.filter(i => window.FundiProfile.matches(i)) : list;
}
function scholarshipsNow() { return profileScoped(allScholarships); }
function jobsNow() { return profileScoped(allJobs); }
function grantsNow() { return profileScoped(allGrants); }

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
  const scored = scholarshipsNow().map(item => {
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
  const scored = jobsNow().map(item => {
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
  const scored = grantsNow().map(item => {
    let score = scoreItem(tokens, `${item.title} ${item.provider} ${item.place} ${item.audience}`);
    if (wantsResearch && item.audience === 'Research') score += 3;
    if (wantsPersonal && item.audience === 'Personal') score += 3;
    if (wantsOrg && item.audience === 'CBOs & Small Orgs') score += 3;
    return { item, score };
  }).filter(s => s.score > 0);
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map(s => s.item);
}

const ADVICE_TOPICS = [
  { key: 'documents', test: /what documents|required documents|documents?\s+(do|would|will)\s+i\s+need|\bchecklist\b/i },
  { key: 'statement', test: /personal statement|statement of purpose|\bsop\b|motivation(al)? letter|application essay/i },
  { key: 'recommendation', test: /recommendation letter|reference letter|\breferee(s)?\b|letter of reference/i },
  { key: 'cv', test: /\bcv\b|r[ée]sum[ée]|curriculum vitae/i },
  { key: 'coverletter', test: /cover letter/i },
  { key: 'interview', test: /\binterview/i },
  { key: 'proposal', test: /grant proposal|funding proposal|\bbudget\b|logical framework|theory of change|proposal writing/i },
  { key: 'choosing', test: /which (one )?should i|too many options|overwhelmed|not sure (which|what|where)|where (else|should i) (look|start)|what (do i need|should i do) next|don'?t know (what|where)/i }
];

function detectAdviceTopic(message) {
  for (let i = 0; i < ADVICE_TOPICS.length; i++) { if (ADVICE_TOPICS[i].test.test(message)) return ADVICE_TOPICS[i].key; }
  return null;
}

function adviceHtml(topic) {
  const profile = window.FundiProfile ? window.FundiProfile.get() : 'all';
  const forBrian = profile === 'brian';
  const forRotich = profile === 'rotich';
  const topics = {
    documents: `<h4>Typical application documents</h4><ul class="chat-advice-list">
      <li><strong>CV / résumé</strong> — 1-2 pages, achievements over duties.</li>
      <li><strong>Personal statement / SOP</strong> — why this field, why this programme, why you.</li>
      <li><strong>Academic transcripts &amp; certificates</strong> — certified copies if asked.</li>
      <li><strong>2-3 reference/recommendation letters</strong> — academic and/or professional.</li>
      <li><strong>Proof of English proficiency</strong> (IELTS/TOEFL) if the programme requires it.</li>
      <li><strong>Passport copy</strong>, and for funded travel sometimes a medical or visa form.</li>
      ${forBrian ? '<li><strong>Research proposal / statement of research interests</strong> — common for PhD and postdoc applications.</li>' : ''}
      ${forRotich ? '<li><strong>Portfolio or work sample</strong> — a dashboard, report or dataset you’ve built, useful for data/analytics roles.</li>' : ''}
    </ul><p class="chat-advice-note">The exact list always varies by programme — this is a starting checklist, not a substitute for the official requirements page.</p>`,
    statement: `<h4>Personal statement / SOP structure</h4><ol class="chat-advice-list">
      <li><strong>Open with a concrete moment</strong> — not "I have always been passionate about...".</li>
      <li><strong>Say why this field, specifically</strong> — ${forBrian ? 'tie it to a real research question in genetics/genomics you want to answer' : forRotich ? 'tie it to something concrete from your data/coffee-trading work or Tech4Change' : 'tie it to something concrete from your own work'}.</li>
      <li><strong>Evidence</strong> — 2-3 specific examples of relevant experience, with a result or number where possible.</li>
      <li><strong>Why this programme/employer</strong> — name something specific about them, not generic praise.</li>
      <li><strong>Future goals</strong> — what you'll do with it, ideally tied back to Kenya or your field.</li>
      <li><strong>Close by echoing your opening.</strong></li>
    </ol><p class="chat-advice-note">Fundi can't read or mark your actual draft — it's a local tool, not a live AI — but a trusted mentor, a programme alumnus, or a free tool like Grammarly for language checks is worth lining up.</p>`,
    recommendation: `<h4>Getting strong recommendation letters</h4><ul class="chat-advice-list">
      <li>Ask people who know your <em>recent</em> work well, not just your most senior contact.</li>
      <li>Give them your CV, draft personal statement and the exact deadline — with at least 3-4 weeks' notice.</li>
      <li>Offer 3-4 bullet points of specific things they could mention (a project, a result, a strength).</li>
      <li>Confirm the submission method early — some programmes have referees submit directly online.</li>
      <li>Send a polite reminder a week before the deadline, and a thank-you after.</li>
    </ul>`,
    cv: `<h4>CV / résumé tips</h4><ul class="chat-advice-list">
      <li>Keep it to 1-2 pages; lead each role with the result, not the job description.</li>
      <li>Quantify wherever you can${forRotich ? ' — e.g. "built dashboards covering X tonnes of coffee volume" or "analysed N datasets"' : forBrian ? ' — e.g. "genotyped N samples" or "ran RNA-seq analysis on X dataset"' : ''}.</li>
      <li>List certifications relevant to the role near the top if you're early-career.</li>
      <li>Tailor the wording to echo the listing's own language — many applications are keyword-screened.</li>
      <li>One consistent format; save as PDF unless a Word doc is specifically requested.</li>
    </ul>`,
    coverletter: `<h4>Cover letter basics</h4><ul class="chat-advice-list">
      <li>3-4 short paragraphs: why this role, why you (with 1-2 concrete examples), why this employer, a confident close.</li>
      <li>Name the role and organisation specifically — no generic "To whom it may concern" templates.</li>
      <li>Mirror 2-3 keywords from the job listing itself.</li>
    </ul>`,
    interview: `<h4>Interview prep</h4><ul class="chat-advice-list">
      <li>Research the organisation's recent work — mention something specific.</li>
      <li>Prepare 3-4 STAR-format stories (Situation, Task, Action, Result) from your own experience.</li>
      <li>For scholarships/fellowships: expect "why this programme" and "what will you do after" — have real answers.</li>
      <li>Prepare 2-3 questions to ask them — it signals genuine interest.</li>
      <li>Free practice: Google's <a href="https://grow.google/certificates/interview-warmup/" target="_blank" rel="noopener">Interview Warmup</a> tool.</li>
    </ul>`,
    proposal: `<h4>Grant / funding proposal basics</h4><ul class="chat-advice-list">
      <li>Open with a clear, specific problem statement — numbers help (how many youth, what skills gap).</li>
      <li>State 2-3 measurable outcomes, not just a list of activities.</li>
      <li>Budget: break into clear line items; funders trust specificity over round numbers.</li>
      <li>Show track record — for Tech4Change, reference what's already been delivered, however small.</li>
      <li>Name a sustainability or partnership plan beyond this one grant.</li>
    </ul>`,
    choosing: `<h4>Not sure where to start?</h4><ul class="chat-advice-list">
      <li>Pick the 2-3 closest deadlines first — filter by "Open now" / "Opening soon" on <a href="scholarships.html">Scholarships</a>, <a href="jobs.html">Jobs</a> or <a href="grants.html">Grants</a>.</li>
      <li>Star anything interesting with the ☆ "Save" button as you browse, then switch on "★ Saved only" to compare your shortlist side by side.</li>
      <li>Tell me more specifically — your current level, and whether you want to study, work, or get funding — and I'll narrow it down.</li>
      <li>Or ask me directly: documents checklist, personal statement tips, CV tips, recommendation letters, interview prep, or proposal writing.</li>
    </ul>`
  };
  return topics[topic] || '';
}

function renderResultRow(item, badge) {
  const saved = window.FundiSaved && window.FundiSaved.isSaved(item.url);
  return `<div class="chat-result"><a href="${item.url}" target="_blank" rel="noopener">${item.title}</a><span>${badge} · ${item.place}<button type="button" class="save-btn${saved ? ' saved' : ''}" data-save-url="${item.url}" aria-pressed="${saved ? 'true' : 'false'}">${saved ? '★' : '☆'}</button></span></div>`;
}

function buildReply(message) {
  const tokens = tokenize(message);
  const levelIntent = detectLevelIntent(message);
  const intents = detectIntents(message);
  const adviceTopic = detectAdviceTopic(message);
  const listingLimit = adviceTopic ? 2 : 4;

  const scholarshipMatches = intents.scholarships ? rankScholarships(tokens, levelIntent, listingLimit) : [];
  const jobMatches = intents.jobs ? rankJobs(tokens, message, listingLimit) : [];
  const grantMatches = intents.grants ? rankGrants(tokens, message, listingLimit) : [];

  const totalMatches = scholarshipMatches.length + jobMatches.length + grantMatches.length;

  if (adviceTopic) {
    let html = adviceHtml(adviceTopic);
    if (totalMatches > 0) {
      html += `<h4>Possibly related listings</h4>`;
      if (scholarshipMatches.length) html += scholarshipMatches.map(i => renderResultRow(i, i.level)).join('');
      if (jobMatches.length) html += jobMatches.map(i => renderResultRow(i, i.mode)).join('');
      if (grantMatches.length) html += grantMatches.map(i => renderResultRow(i, i.audience)).join('');
    }
    return html;
  }

  if (totalMatches === 0) {
    const profileNote = window.FundiProfile && window.FundiProfile.get() !== 'all' ? ` You're currently viewing for <strong>${window.FundiProfile.labelFor(window.FundiProfile.get())}</strong> — try switching the "Viewing for" selector above if you meant the other profile.` : '';
    return `<p>I couldn't find a close match for that in the current listings.${profileNote} Try naming your field, current level (e.g. "finishing a Masters"), and whether you want a scholarship, a job (including remote AI data-work tasks), or funding (personal, research, or for a CBO/small org) — or browse <a href="scholarships.html">Scholarships</a>, <a href="jobs.html">Jobs</a> and <a href="grants.html">Grants</a> directly.</p><p>I can also help with the application side: ask about <strong>documents needed</strong>, <strong>personal statements</strong>, <strong>CVs</strong>, <strong>recommendation letters</strong>, <strong>interview prep</strong>, or <strong>proposal writing</strong>.</p>`;
  }

  let html = `<p>Here's what looks closest to that, from the hand-verified listings:</p>`;
  if (scholarshipMatches.length) {
    html += `<h4>Scholarships &amp; fellowships</h4>` + scholarshipMatches.map(i => renderResultRow(i, i.level)).join('');
  }
  if (jobMatches.length) {
    html += `<h4>Jobs</h4>` + jobMatches.map(i => renderResultRow(i, i.mode)).join('');
  }
  if (grantMatches.length) {
    html += `<h4>Grants &amp; funding</h4>` + grantMatches.map(i => renderResultRow(i, i.audience)).join('');
  }
  html += `<p style="margin-top:14px;font-size:11.5px;color:var(--muted)">Every link above goes to the issuing organisation's own official page. Always confirm eligibility and deadlines there before applying.</p>`;
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

if (window.FundiSaved) window.FundiSaved.wireClicks();

addMessage(`<p>Pick <strong>Miss Rotich</strong> or <strong>Mr. Brian</strong> in the "Viewing for" bar above (or leave it on Everyone), then tell me your field, current level, and what you're after — a scholarship, a job (remote AI data-work tasks included), or funding (personal, research, or for the Tech4Change CBO) — and I'll shortlist matches from the hand-verified listings.</p><p>I can also help with the application itself — ask about <strong>documents needed</strong>, <strong>personal statements</strong>, <strong>CVs</strong>, <strong>recommendation letters</strong>, <strong>interview prep</strong>, <strong>proposal writing</strong>, or just say you're <strong>not sure where to start</strong>.</p>`, 'fundi');
