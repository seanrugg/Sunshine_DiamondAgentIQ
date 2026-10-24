// Sunshine DiamondAgentIQ — phone-first app. Always works offline from
// data/kb.json. Answers can optionally be written by an AI model on the
// phone, the user's own AI provider, or the league server (see ai/engines.js).
import { citationOf, CALL_LABELS, SANCTION_LABELS } from './core/answer.js';
import { answerQuestion, loadSettings, saveSettings, detectDevice, isDownloaded, pickBuild, startDeviceModel, TIERS } from './ai/engines.js';
import { initAiPanel, openAiPanel } from './ai/panel.js';
import { computeRest } from './core/pitchRest.js';
import { DISCLAIMER, PHILOSOPHY_POINTS, SUNSHINE_MISSION } from './core/philosophy.js';

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const store = {
  get(k, d) { try { return localStorage.getItem(k) ?? d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* private mode */ } },
};

const state = { kb: null, role: store.get('role', 'parent'), division: store.get('division', '10U'), ai: loadSettings(), device: null };

const EXAMPLES = {
  parent: ['My son struck out looking to end the game. How do I help him?', 'Can I tell the umpire he missed a call?', 'What bat should I buy for my 9 year old?', 'Can my kid wear cleats at Sunshine Ballpark?'],
  coach: ['My 12 year old threw 70 pitches today. When can he pitch again?', 'A player shows up in the third inning. Where does he bat?', 'We only have 8 players. Can we play?', 'My hitter is scared of the ball. What can I do?'],
  player: ['I keep striking out on outside pitches. What should I work on?', 'Can I run on a dropped third strike in 13U?', 'Can I slide headfirst?', 'I made the last out. How do I get past it?'],
  umpire: ['A parent keeps yelling about balls and strikes. What do I do?', 'Can a 10U runner steal home on a passed ball?', 'When does the five-run rule not apply?', 'How many warm-up pitches does an 18U pitcher get?'],
};

// ---------- boot ----------
async function boot() {
  state.kb = await (await fetch('data/kb.json')).json();
  $('#division').value = state.division;
  setRole(state.role);
  wireTabs();
  wireAsk();
  wirePitch();
  $('#division').addEventListener('change', (e) => { state.division = e.target.value; store.set('division', state.division); renderRules(); });
  $('#rule-search').addEventListener('input', renderRules);
  renderRules();
  renderLessons();
  renderLeague();
  $('#p-date').value = new Date().toISOString().slice(0, 10);
  if ('serviceWorker' in navigator) {
    // When a new version of the app installs, reload once so the phone runs it.
    const hadController = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.addEventListener('controllerchange', () => { if (hadController) location.reload(); });
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
  await setupAi();
}

// ---------- answer engine ----------
async function setupAi() {
  const param = new URLSearchParams(location.search).get('api'); // ?api=https://league-server links set the league server
  if (param) { state.ai.server.url = param; state.ai.tier = 'server'; state.ai.chosen = true; }
  state.device = await detectDevice();
  initAiPanel({
    getSettings: () => state.ai,
    onSaved: (s) => { state.ai = s; renderModePill(); renderSetupCard(); },
    device: state.device,
  });
  $('#mode-pill').addEventListener('click', () => openAiPanel());
  document.querySelectorAll('[data-open-ai]').forEach((b) => b.addEventListener('click', () => openAiPanel(b.dataset.openAi || undefined)));
  renderModePill();
  renderSetupCard();
  // Warm up the phone model in the background so the first question is quick.
  if (state.ai.tier === 'device') {
    const build = pickBuild(state.ai.device.model, state.device);
    if (build && await isDownloaded(build.modelId)) startDeviceModel(build.modelId).catch(() => {});
  }
}

function renderModePill() {
  const pill = $('#mode-pill');
  pill.textContent = TIERS[state.ai.tier]?.short || 'Offline';
  pill.classList.toggle('live', state.ai.tier !== 'offline');
}

function renderSetupCard() {
  const card = $('#setup-card');
  if (state.ai.chosen) { card.hidden = true; return; }
  card.hidden = false;
  const canRun = state.device?.recommended === 'device';
  card.innerHTML = `<h3>Set up answers on this phone</h3>
    <p>${canRun
      ? 'This phone can run a small AI model itself. Download it once (about 0.7 GB, Wi-Fi recommended) and answers stay private and work without internet.'
      : esc(state.device?.reason || 'This phone works best with offline answers.')}</p>
    <div class="row">
      ${canRun ? '<button type="button" class="primary small-btn" data-pick="device">Get phone AI</button>' : ''}
      <button type="button" class="ghost" data-pick="offline">${canRun ? 'Keep it simple (offline)' : 'Use offline answers'}</button>
      <button type="button" class="ghost" data-pick="more">More options</button>
    </div>`;
  card.querySelectorAll('[data-pick]').forEach((b) => b.addEventListener('click', () => {
    const pick = b.dataset.pick;
    if (pick === 'offline') {
      state.ai = { ...state.ai, tier: 'offline', chosen: true };
      saveSettings(state.ai);
      renderModePill(); renderSetupCard();
    } else openAiPanel(pick === 'device' ? 'device' : undefined);
  }));
}

// ---------- tabs ----------
function wireTabs() {
  document.querySelectorAll('.tabs button').forEach((b) => b.addEventListener('click', () => {
    document.querySelectorAll('.tabs button').forEach((x) => x.classList.toggle('on', x === b));
    document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t.id === `tab-${b.dataset.tab}`));
    window.scrollTo(0, 0);
  }));
}

// ---------- ask ----------
function setRole(role) {
  state.role = role;
  store.set('role', role);
  if (state.kb) renderLessons();
  document.querySelectorAll('.role').forEach((b) => b.classList.toggle('on', b.dataset.role === role));
  $('#examples').innerHTML = EXAMPLES[role].map((q) => `<button type="button">${esc(q)}</button>`).join('');
  $('#examples').querySelectorAll('button').forEach((b) => b.addEventListener('click', () => {
    $('#question').value = b.textContent;
    const age = b.textContent.match(/(\d{1,2}) year old/);
    if (age) $('#age').value = age[1];
    $('#ask-form').requestSubmit();
  }));
}

function wireAsk() {
  document.querySelectorAll('.role').forEach((b) => b.addEventListener('click', () => setRole(b.dataset.role)));
  $('#ask-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const question = $('#question').value.trim();
    if (!question) return;
    const ageVal = parseInt($('#age').value, 10);
    const input = { question, role: state.role, division: Number.isFinite(ageVal) ? undefined : state.division, age: Number.isFinite(ageVal) ? ageVal : undefined };
    const btn = e.submitter || $('#ask-form .primary');
    btn.disabled = true; btn.textContent = state.ai.tier === 'offline' ? 'Looking it up…' : 'Thinking…';
    try {
      renderAnswer(await ask(input));
    } finally {
      btn.disabled = false; btn.textContent = 'Ask';
    }
  });
}

async function ask(input) {
  return answerQuestion(state.kb, input, state.ai, state.device);
}

function renderAnswer(a) {
  const ct = a.call_type || 'coaching';
  const parts = [];
  parts.push(`<div class="card verdict">
    <span class="stamp ${esc(ct)}">${esc(a.call_label || CALL_LABELS[ct])}</span>
    <p>${esc(a.verdict)}</p>
    ${a.engine ? `<div class="cite">Written by ${esc(a.engine)} from the rules below.</div>` : ''}
    ${a.fallback_reason ? `<div class="cite">AI not available right now (${esc(a.fallback_reason)}), so this answer comes straight from the rules.</div>` : ''}
  </div>`);
  if (a.teachable) parts.push(teachableHtml(a.teachable, a.ai_moment));
  if (a.rules?.length) {
    parts.push(`<details class="card" ${ct === 'coaching' ? '' : 'open'}><summary>Where this comes from (${a.rules.length})</summary>${a.rules.map(ruleHtml).join('')}</details>`);
  }
  if (a.pending_house_rules?.length) {
    parts.push(`<div class="card pending"><h3>Not in the app yet</h3><p class="small">The league hasn't entered these house rules yet, so the Little League rule applies until it does:</p>
      <ul class="plain">${a.pending_house_rules.map((h) => `<li>${esc(h.question)}</li>`).join('')}</ul></div>`);
  }
  if (a.draft_notice) parts.push(`<p class="draft">${esc(a.draft_notice)}</p>`);
  parts.push(`<p class="disclaimer">${esc(a.disclaimer || DISCLAIMER)}</p>`);
  $('#answer').innerHTML = parts.join('');
  $('#answer').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function ruleHtml(r) {
  const link = r.url ? ` · <a href="${esc(r.url)}" target="_blank" rel="noopener">source</a>` : '';
  return `<div class="card ${r.id?.startsWith('H') ? 'house' : ''}"><p>${esc(r.text)}</p>
    <div class="cite">${esc(r.label)}${link}${r.verified ? '' : ' · draft summary'}</div></div>`;
}

// ---------- rules ----------
function renderRules() {
  const { kb } = state;
  const div = kb.league.divisions.find((d) => d.id === state.division);
  document.querySelectorAll('.div-label').forEach((el) => { el.textContent = `${div.label} (ages ${div.age_min}-${div.age_max})`; });
  const q = $('#rule-search').value.trim().toLowerCase();
  const match = (...f) => !q || f.join(' ').toLowerCase().includes(q);

  const house = kb.house_rules.filter((h) => (h.divisions.includes('all') || h.divisions.includes(div.id)) && match(h.topic, h.section, h.keywords, h.text, h.question));
  const sections = [...new Set(house.map((h) => h.section))];
  $('#house-rules').innerHTML = sections.map((sec) => `<details class="card house" ${q ? 'open' : ''}><summary>${esc(sec)}</summary>
    ${house.filter((h) => h.section === sec).map((h) => h.text
      ? `<p>${esc(h.text)}</p>${h.note ? `<p class="small">Note: ${esc(h.note)}</p>` : ''}`
      : `<p class="small">Not entered yet: ${esc(h.question)}</p>`).join('')}
  </details>`).join('') || '<p class="small">No matches.</p>';
  $('#house-doc').innerHTML = kb.league.rulebook.house_rules_doc
    ? `<a href="${esc(kb.league.rulebook.house_rules_doc)}" target="_blank" rel="noopener">Open the full house rules document</a>` : '';

  const book = SANCTION_LABELS[div.base_sanction];
  document.querySelectorAll('.book-label').forEach((el) => { el.textContent = book; });
  const facts = kb.rule_facts.filter((f) => f.sanction === div.base_sanction && (f.age_max ?? 99) >= div.age_min && (f.age_min ?? 0) <= div.age_max && match(f.topic, f.key, f.text, f.division));
  $('#ll-rules').innerHTML = facts.map((f) => ruleHtml({ ...f, ...citationOf(f, kb) })).join('') || '<p class="small">No matches.</p>';
}

// ---------- pitch count ----------
function wirePitch() {
  $('#pitch-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const age = parseInt($('#p-age').value, 10);
    const r = computeRest(state.kb, {
      age: Number.isFinite(age) ? age : undefined,
      division: Number.isFinite(age) ? undefined : state.division,
      pitches: parseInt($('#p-pitches').value, 10),
      pitchedOn: $('#p-date').value,
    });
    if (!r.ok) { $('#pitch-result').innerHTML = `<div class="card pending"><p>${esc(r.error)}</p></div>`; return; }
    const when = new Date(`${r.eligible_on}T12:00:00`).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
    $('#pitch-result').innerHTML = `<div class="card verdict">
      <div class="big">${r.rest_days} day${r.rest_days === 1 ? '' : 's'}</div><p>of rest. Eligible to pitch again <strong>${esc(when)}</strong>.</p>
      <p class="small">${esc(r.division)} daily limit: ${r.daily_max} pitches.${r.over_limit ? ' <strong>Over the limit.</strong>' : ''}</p></div>
      ${r.house_rule ? `<div class="card house"><p>${esc(r.house_rule.text)}</p><div class="cite">${esc(r.source)}</div></div>` : ''}
      ${r.notes.map((n) => `<div class="card"><p class="small">${esc(n)}</p></div>`).join('')}`;
  });
}

// ---------- learn ----------
const ROLE_NAMES = { player: 'Player', parent: 'Parent', coach: 'Coach', umpire: 'Umpire' };

/** The teachable moment: the heart of every answer. */
function teachableHtml(t, aiMoment) {
  const you = t.perspectives.find((p) => p.you);
  const others = t.perspectives.filter((p) => !p.you);
  const plan = [['Player', t.plan.player], ['Team', t.plan.team], ['At home', t.plan.home]]
    .filter(([, v], i, arr) => v && arr.findIndex(([, w]) => w === v) === i); // drop empty and repeated steps
  return `<section class="card teach" aria-label="Teachable moment">
    <div class="teach-head"><span class="bulb" aria-hidden="true">💡</span><h3>Teachable moment</h3></div>
    <p class="moment">${esc(aiMoment || t.moment)}</p>
    ${t.lesson ? `<div class="lesson-name">${esc(t.lesson.title)}</div><p>${esc(t.lesson.principle)}</p>` : ''}
    ${t.principle ? `<div class="lesson-name">${esc(t.principle.source)}</div><p>${esc(t.principle.text)}</p>` : ''}
    ${you ? `<div class="persp you"><strong>For you, the ${esc(you.label.toLowerCase())}</strong><p>${esc(you.text)}</p></div>` : ''}
    ${others.length ? `<details class="persp-more"><summary>What it means for ${others.map((p) => esc({ player: 'players', parent: 'parents', coach: 'coaches', umpire: 'umpires' }[p.role])).join(', ').replace(/, ([^,]*)$/, ' and $1')}</summary>
      ${others.map((p) => `<div class="persp"><strong>${esc(p.label)}</strong><p>${esc(p.text)}</p></div>`).join('')}</details>` : ''}
    ${t.next_step ? `<div class="next"><strong>One thing to try this week</strong><p>${esc(t.next_step)}</p>${t.why ? `<p class="small">Why: ${esc(t.why)}</p>` : ''}</div>` : ''}
    ${t.lesson ? `<div class="beyond"><strong>Beyond the diamond</strong><p>${esc(t.lesson.life_lesson)}</p></div>` : ''}
  </section>
  <div class="card"><h3>Who to talk to</h3><p><strong>${esc(t.channel.who)}.</strong> ${esc(t.channel.how)}</p></div>
  ${t.situation ? `<details class="card" open><summary>The game situation: ${esc(t.situation.name)}</summary>
    <p><strong>Offense:</strong> ${esc(t.situation.offense)}</p><p><strong>Defense:</strong> ${esc(t.situation.defense)}</p>
    ${t.situation.common_mistakes ? `<p><strong>Common mistakes:</strong> ${esc(t.situation.common_mistakes)}</p>` : ''}</details>` : ''}
  ${plan.length > 1 ? `<details class="card"><summary>Improvement plan</summary>${plan.map(([k, v]) => `<p><strong>${k}:</strong> ${esc(v)}</p>`).join('')}</details>` : ''}
  ${t.story ? `<details class="card story"><summary>From the dugout: ${esc(t.story.title)}</summary><p>${esc(t.story.text)}</p></details>` : ''}`;
}

// ---------- learn: the coaching library ----------
function renderLessons() {
  const kb = state.kb;
  const roleFirst = (l) => [state.role, ...['player', 'parent', 'coach', 'umpire'].filter((r) => r !== state.role)].filter((r) => l.for[r]);
  const lessons = kb.lessons.map((l) => `<details class="card"><summary>${esc(l.title)}</summary>
    <p>${esc(l.principle)}</p><p class="beyond-line"><strong>Beyond the diamond:</strong> ${esc(l.life_lesson)}</p>
    ${roleFirst(l).map((r) => `<p class="lesson-role${r === state.role ? ' you' : ''}"><strong>${ROLE_NAMES[r]}:</strong> ${esc(l.for[r])}</p>`).join('')}
  </details>`).join('');
  const situations = kb.situations.map((t) => `<details class="card"><summary>${esc(t.name)}</summary>
    <p><strong>Offense:</strong> ${esc(t.offense)}</p><p><strong>Defense:</strong> ${esc(t.defense)}</p>
    ${t.common_mistakes ? `<p><strong>Common mistakes:</strong> ${esc(t.common_mistakes)}</p>` : ''}
    <p class="small">Check your division's rule first: in Sunshine 10U the batter can't run on a dropped third strike.</p></details>`).join('');
  const stories = kb.stories.map((t) => `<details class="card story"><summary>${esc(t.title)}</summary><p>${esc(t.text)}</p></details>`).join('');
  const tips = kb.insights.filter((i) => i.sport !== 'softball').map((i) => `<details class="card"><summary>${esc(i.situation)}</summary>
    <p>${esc(i.text)}</p>${i.why ? `<p class="small"><strong>Why:</strong> ${esc(i.why)}</p>` : ''}${i.try_this ? `<p><strong>Try this:</strong> ${esc(i.try_this)}</p>` : ''}
    <p class="small">For ${i.audience === 'all' ? 'everyone' : esc(i.audience + 's')}</p></details>`).join('');
  $('#lessons').innerHTML = `
    <div class="card hero-lite"><p>${esc(SUNSHINE_MISSION)}</p></div>
    <details class="card" open><summary>Our coaching philosophy</summary><ol class="philosophy">${PHILOSOPHY_POINTS.map((p) => `<li>${esc(p)}</li>`).join('')}</ol></details>
    <h2>Life lessons</h2>${lessons}
    <h2>Game situations</h2>${situations}
    <h2>From the dugout</h2>${stories}
    <h2>Coaching tips</h2>${tips}
    <p class="small">Written by our team's youth coach, travel-ball parent and youth umpire. Draft notes until the league reviews them.</p>`;
}

// ---------- league ----------
function renderLeague() {
  const L = state.kb.league;
  $('#league-name').textContent = L.name;
  $('#league-mission').textContent = L.mission;
  const todo = (s) => (String(s).startsWith('TODO') ? '<span class="small">Coming soon</span>' : esc(s));
  $('#league-body').innerHTML = `
    <div class="card"><p>${esc(L.about)}</p><p>${esc(L.welcome)}</p></div>
    <h2>Divisions</h2>
    ${L.divisions.map((d) => `<div class="card"><h3>${esc(d.label)} · ages ${d.age_min}-${d.age_max}</h3><p class="small">${esc(d.field)}. ${esc(d.home_field)}. Sunshine house rules, then ${esc(SANCTION_LABELS[d.base_sanction])} rules.</p></div>`).join('')}
    <h2>Get involved</h2>
    ${L.get_involved.map((g) => `<div class="card"><h3>${esc(g.role)}</h3><p>${esc(g.what)}</p><p class="small">${todo(g.next_step)}</p></div>`).join('')}
    <h2>Fields</h2>
    <div class="card"><ul class="plain">${L.fields.map((f) => `<li><strong>${esc(f.site)}</strong>: ${f.fields.map(esc).join(', ')}</li>`).join('')}</ul></div>
    <h2>Contact</h2>
    <div class="card"><p>Phone: <a href="tel:${esc(L.contact.phone)}">${esc(L.contact.phone)}</a></p>
      <p><a href="${esc(L.contact.website)}" target="_blank" rel="noopener">Register on the league website</a></p></div>`;
}

boot();
