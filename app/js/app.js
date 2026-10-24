// Sunshine DiamondAgentIQ — phone-first app. Works fully offline from
// data/kb.json; if a server is reachable (same origin, or ?api=https://…),
// questions go to it for a model-written answer.
import { retrieve } from './core/retrieve.js';
import { composeOffline, CALL_LABELS } from './core/answer.js';
import { computeRest } from './core/pitchRest.js';
import { DISCLAIMER } from './core/philosophy.js';

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const store = {
  get(k, d) { try { return localStorage.getItem(k) ?? d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* private mode */ } },
};

const state = { kb: null, role: store.get('role', 'parent'), division: store.get('division', '10U'), api: null };

const EXAMPLES = {
  parent: ['My son struck out looking to end the game. How do I help him?', 'Can I tell the umpire he missed a call?', 'What bat should I buy for my 9 year old?'],
  coach: ['My 12 year old threw 70 pitches today. When can he pitch again?', 'Can my catcher pitch after catching 4 innings?', 'My hitter is scared of the ball. What can I do?'],
  player: ['I keep striking out on outside pitches. What should I work on?', 'Do I have to run on a dropped third strike?', 'I made the last out. How do I get past it?'],
  umpire: ['A parent keeps yelling about balls and strikes. What do I do?', 'Can a team protest my strike call?', 'Who can run as a courtesy runner?'],
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
  detectServer();
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
}

async function detectServer() {
  const param = new URLSearchParams(location.search).get('api');
  if (param) store.set('api', param);
  const candidates = [store.get('api', ''), ''].filter((v, i, a) => a.indexOf(v) === i);
  for (const base of candidates) {
    try {
      const r = await fetch(`${base}/api/health`, { signal: AbortSignal.timeout(2500) });
      if (r.ok) {
        const h = await r.json();
        state.api = base;
        $('#mode-pill').textContent = h.llm ? 'live' : 'server';
        $('#mode-pill').classList.toggle('live', !!h.llm);
        return;
      }
    } catch { /* offline or no server */ }
  }
  $('#mode-pill').textContent = 'offline';
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
    btn.disabled = true; btn.textContent = 'Thinking…';
    try {
      renderAnswer(await ask(input));
    } finally {
      btn.disabled = false; btn.textContent = 'Ask';
    }
  });
}

async function ask(input) {
  if (state.api !== null) {
    try {
      const r = await fetch(`${state.api}/api/ask`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input), signal: AbortSignal.timeout(45000),
      });
      if (r.ok) return await r.json();
    } catch { /* fall through to offline */ }
  }
  return composeOffline(state.kb, input, retrieve(state.kb, input));
}

function renderAnswer(a) {
  const ct = a.call_type || 'coaching';
  const parts = [];
  parts.push(`<div class="card verdict">
    <span class="stamp ${esc(ct)}">${esc(a.call_label || CALL_LABELS[ct])}</span>
    <p>${esc(a.verdict)}</p>
    ${a.mode === 'llm' ? '<div class="cite">Written by the league assistant from the rules below.</div>' : ''}
  </div>`);
  if (a.for_role?.text) parts.push(`<div class="card"><h3>${esc(a.for_role.label)}</h3><p>${esc(a.for_role.text)}</p></div>`);
  if (a.lesson) parts.push(`<div class="card"><h3>Beyond the diamond: ${esc(a.lesson.title)}</h3><p>${esc(a.lesson.life_lesson)}</p></div>`);
  if (a.tip) parts.push(`<div class="card"><h3>Try this</h3><p>${esc(a.tip.try_this || a.tip.text)}</p></div>`);
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

  const house = kb.house_rules.filter((h) => (h.division === 'all' || h.division === div.id) && match(h.topic, h.section, h.text, h.question));
  $('#house-rules').innerHTML = house.map((h) => h.text
    ? `<div class="card house"><h3>${esc(h.section)}</h3><p>${esc(h.text)}</p><div class="cite">${h.verified ? 'Verified by the league' : 'Draft, awaiting board review'}</div></div>`
    : `<div class="card pending"><h3>${esc(h.section)}</h3><p class="small">Not entered yet: ${esc(h.question)}</p></div>`).join('') || '<p class="small">No matches.</p>';

  const facts = kb.ll_facts.filter((f) => (f.age_max ?? 99) >= div.age_min && (f.age_min ?? 0) <= div.age_max && match(f.topic, f.key, f.text, f.division));
  $('#ll-rules').innerHTML = facts.map((f) => ruleHtml({ ...f, label: `${kb.sources[f.source_id]?.title || 'Little League'}${f.rule_ref ? ' · ' + f.rule_ref : ''}` })).join('') || '<p class="small">No matches.</p>';
}

// ---------- pitch count ----------
function wirePitch() {
  $('#pitch-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const r = computeRest(state.kb, { age: parseInt($('#p-age').value, 10), pitches: parseInt($('#p-pitches').value, 10), pitchedOn: $('#p-date').value });
    if (!r.ok) { $('#pitch-result').innerHTML = `<div class="card pending"><p>${esc(r.error)}</p></div>`; return; }
    const when = new Date(`${r.eligible_on}T12:00:00`).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
    $('#pitch-result').innerHTML = `<div class="card verdict">
      <div class="big">${r.rest_days} day${r.rest_days === 1 ? '' : 's'}</div><p>of rest. Eligible to pitch again <strong>${esc(when)}</strong>.</p>
      <p class="small">Daily limit for ages ${esc(r.band)}: ${r.daily_max} pitches.${r.over_limit ? ' <strong>Over the limit.</strong>' : ''}</p></div>
      ${r.house_rule ? `<div class="card house"><p>${esc(r.house_rule.text)}</p></div>` : ''}
      ${r.notes.map((n) => `<div class="card"><p class="small">${esc(n)}</p></div>`).join('')}
      <div class="cite">Little League Regulation VI · <a href="${esc(r.source_url)}" target="_blank" rel="noopener">source</a>${r.verified ? '' : ' · draft summary'}</div>`;
  });
}

// ---------- learn ----------
function renderLessons() {
  $('#lessons').innerHTML = state.kb.lessons.map((l) => `<details class="card"><summary>${esc(l.title)}</summary>
    <p>${esc(l.principle)}</p><p><em>${esc(l.life_lesson)}</em></p>
    ${['player', 'coach', 'parent', 'umpire'].filter((r) => l.for[r]).map((r) => `<p class="lesson-role"><strong>${r[0].toUpperCase() + r.slice(1)}:</strong> ${esc(l.for[r])}</p>`).join('')}
  </details>`).join('');
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
    ${L.divisions.map((d) => `<div class="card"><h3>${esc(d.label)} · ages ${d.age_min}-${d.age_max}</h3><p class="small">Plays under ${esc(d.ll_division_hint)} rules plus Sunshine house rules.</p></div>`).join('')}
    <h2>Get involved</h2>
    ${L.get_involved.map((g) => `<div class="card"><h3>${esc(g.role)}</h3><p>${esc(g.what)}</p><p class="small">${todo(g.next_step)}</p></div>`).join('')}
    <h2>Fields</h2>
    <div class="card"><ul class="plain">${L.fields.map((f) => `<li><strong>${esc(f.site)}</strong>: ${f.fields.map(esc).join(', ')}</li>`).join('')}</ul></div>
    <h2>Contact</h2>
    <div class="card"><p>Phone: <a href="tel:${esc(L.contact.phone)}">${esc(L.contact.phone)}</a></p>
      <p><a href="${esc(L.contact.website)}" target="_blank" rel="noopener">Register on the league website</a></p></div>`;
}

boot();
