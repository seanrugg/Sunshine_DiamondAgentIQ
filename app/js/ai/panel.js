// The "How should answers work?" panel: pick a tier, download the phone
// model, connect an AI provider, or point at the league server.
import {
  TIERS, DEVICE_MODELS, saveSettings, pickBuild, isDownloaded, startDeviceModel, deleteDeviceModel, checkServer,
} from './engines.js';
import { PROVIDER_PRESETS, listProviderModels, chatProvider } from '../core/providers.js';

const $ = (s, root = document) => root.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

let ctx = null;     // { getSettings, onSaved, device }
let draft = null;   // settings being edited
let busy = false;

export function initAiPanel(context) {
  ctx = context;
  const dlg = $('#ai-panel');
  dlg.querySelectorAll('input[name=tier]').forEach((r) => r.addEventListener('change', () => { draft.tier = r.value; showBodies(); }));
  $('#device-model').innerHTML = DEVICE_MODELS.map((m) => `<option value="${m.id}">${esc(m.label)}</option>`).join('');
  $('#device-model').addEventListener('change', (e) => { draft.device.model = e.target.value; renderDevice(); });
  $('#device-delete').addEventListener('click', removeModel);
  $('#provider-preset').innerHTML = Object.entries(PROVIDER_PRESETS).map(([k, p]) => `<option value="${k}">${esc(p.label)}</option>`).join('');
  $('#provider-preset').addEventListener('change', (e) => {
    const p = PROVIDER_PRESETS[e.target.value];
    draft.provider = { ...draft.provider, preset: e.target.value, baseUrl: p.baseUrl, model: '' };
    renderProvider();
  });
  for (const [id, key] of [['#provider-url', 'baseUrl'], ['#provider-key', 'apiKey'], ['#provider-model', 'model']]) {
    $(id).addEventListener('input', (e) => { draft.provider[key] = e.target.value.trim(); });
  }
  $('#provider-load').addEventListener('click', loadModels);
  $('#provider-test').addEventListener('click', testProvider);
  $('#server-url').addEventListener('input', (e) => { draft.server.url = e.target.value.trim(); });
  $('#server-test').addEventListener('click', testServer);
  $('#ai-save').addEventListener('click', save);
  $('#ai-close').addEventListener('click', () => { if (!busy) dlg.close(); });
}

export function openAiPanel(tier) {
  draft = structuredClone(ctx.getSettings());
  if (tier) draft.tier = tier;
  $(`#ai-panel input[name=tier][value=${draft.tier}]`).checked = true;
  $('#device-model').value = draft.device.model;
  status('#ai-status', '');
  renderDeviceCheck();
  renderDevice();
  renderProvider();
  $('#server-url').value = draft.server.url;
  showBodies();
  $('#ai-panel').showModal();
}

function showBodies() {
  document.querySelectorAll('#ai-panel .tier-body').forEach((b) => { b.hidden = b.dataset.for !== draft.tier; });
  document.querySelectorAll('#ai-panel .tier').forEach((t) => t.classList.toggle('on', $('input', t).value === draft.tier));
  $('#ai-save').textContent = draft.tier === 'device' ? 'Download and use' : `Use ${TIERS[draft.tier].label.toLowerCase()}`;
}

function status(sel, text, kind = '') {
  const el = $(sel);
  el.textContent = text;
  el.className = `status ${kind}`;
}

// ---------- phone model ----------
function renderDeviceCheck() {
  const d = ctx.device;
  const radio = $('#ai-panel input[value=device]');
  radio.disabled = !d.webgpu;
  $('#device-check').innerHTML = d.webgpu
    ? `<span class="ok">✓ This phone can run it.</span>${d.lowMemory ? ` <span class="warn">${esc(d.reason)}</span>` : ''}`
    : `<span class="warn">✗ ${esc(d.reason)}</span>`;
}

async function renderDevice() {
  const build = pickBuild(draft.device.model, ctx.device);
  const m = DEVICE_MODELS.find((x) => x.id === draft.device.model);
  $('#device-delete').hidden = true;
  if (!build) {
    $('#device-info').textContent = ctx.device.webgpu ? `${m.label} needs a GPU feature this phone doesn't have. Pick another model.` : '';
    return;
  }
  const free = ctx.device.freeMB ? ` Free space for the app: about ${(ctx.device.freeMB / 1000).toFixed(1)} GB.` : '';
  $('#device-info').textContent = `${m.note} Download ${m.download}; needs about ${(build.needMB / 1000).toFixed(1)} GB of graphics memory while answering.${free}`;
  const have = await isDownloaded(build.modelId);
  if (have) {
    $('#device-info').textContent = `${m.note} Downloaded and ready on this phone. Works without internet.`;
    $('#device-delete').hidden = false;
  }
}

async function downloadModel() {
  const build = pickBuild(draft.device.model, ctx.device);
  if (!build) throw new Error("This phone can't run that model.");
  const bar = $('#device-progress');
  const m = DEVICE_MODELS.find((x) => x.id === draft.device.model);
  const needMB = parseFloat(m.download.match(/[\d.]+/)[0]) * 1000;
  if (ctx.device.freeMB && ctx.device.freeMB < needMB * 1.1 && !(await isDownloaded(build.modelId))) {
    throw new Error(`Not enough free space on this phone for the model (needs ${m.download}, about ${(ctx.device.freeMB / 1000).toFixed(1)} GB free). Free up space, or use offline answers or an AI provider.`);
  }
  bar.hidden = false;
  bar.value = 0;
  let done = false;
  try {
    await startDeviceModel(build.modelId, ({ progress, text }) => {
      if (done) return; // ignore late progress after a failure
      bar.value = progress;
    const mb = text.match(/(\d+)\s*MB fetched/);
    if (mb) status('#ai-status', `Downloading the AI model: ${Math.round(progress * 100)}% (${mb[1]} MB). Keep this screen open; Wi-Fi recommended.`);
    else if (/shader|GPU|Loading model from cache/i.test(text)) status('#ai-status', 'Setting up the model on this phone…');
      else if (text) status('#ai-status', text.replace(/\[.*?\]\s*/g, '').slice(0, 140));
    });
  } catch (e) {
    if (/quota/i.test(e?.name || '') || /quota/i.test(e?.message || '')) {
      throw new Error('This phone ran out of storage space for the model. Free up space, or use offline answers or an AI provider.');
    }
    if (/fetch|network/i.test(e?.message || '')) throw new Error('The download was interrupted. Check the connection (Wi-Fi recommended) and try again; it picks up where it left off.');
    throw e;
  } finally {
    done = true;
    bar.hidden = true;
  }
}

async function removeModel() {
  const build = pickBuild(draft.device.model, ctx.device);
  if (!build || !confirm('Delete the AI model from this phone? You can download it again later.')) return;
  await deleteDeviceModel(build.modelId);
  if (draft.tier === 'device') draft.tier = 'offline';
  const saved = { ...ctx.getSettings(), tier: ctx.getSettings().tier === 'device' ? 'offline' : ctx.getSettings().tier };
  saveSettings(saved);
  ctx.onSaved(saved);
  $('#ai-panel input[value=offline]').checked = draft.tier === 'offline';
  showBodies();
  renderDevice();
  status('#ai-status', 'Model deleted. Answers are offline until you choose again.');
}

// ---------- AI provider ----------
function renderProvider() {
  const p = PROVIDER_PRESETS[draft.provider.preset] || PROVIDER_PRESETS.custom;
  $('#provider-preset').value = draft.provider.preset;
  $('#provider-hint').innerHTML = `${esc(p.hint)}${p.keyUrl ? ` <a href="${p.keyUrl}" target="_blank" rel="noopener">Get a key</a>` : ''}`;
  $('#provider-url-row').hidden = !['custom', 'ollama'].includes(draft.provider.preset);
  $('#provider-url').value = draft.provider.baseUrl;
  $('#provider-key-row').hidden = !p.needsKey && draft.provider.preset !== 'custom';
  $('#provider-key').value = draft.provider.apiKey;
  $('#provider-model').value = draft.provider.model;
  status('#provider-status', '');
}

async function loadModels() {
  status('#provider-status', 'Loading models…');
  try {
    const ids = await listProviderModels(draft.provider);
    $('#provider-models').innerHTML = ids.slice(0, 300).map((id) => `<option value="${esc(id)}"></option>`).join('');
    if (!draft.provider.model && ids.length) { draft.provider.model = ids[0]; $('#provider-model').value = ids[0]; }
    status('#provider-status', `${ids.length} models found. Pick one in the Model box.`, 'ok');
  } catch (e) {
    status('#provider-status', `Couldn't load models: ${e.message}`, 'warn');
  }
}

async function testProvider() {
  status('#provider-status', 'Testing…');
  try {
    await chatProvider(draft.provider, [{ role: 'user', content: 'Reply with the JSON {"ok": true}' }], { timeoutMs: 30000 });
    status('#provider-status', '✓ Connected.', 'ok');
    return true;
  } catch (e) {
    status('#provider-status', `✗ ${e.message}`, 'warn');
    return false;
  }
}

// ---------- league server ----------
async function testServer() {
  status('#server-status', 'Checking…');
  try {
    const h = await checkServer(draft.server.url);
    status('#server-status', h.llm ? `✓ Connected (${h.model}).` : '✓ Connected, but the server has no AI model set up; answers will be offline.', 'ok');
    return true;
  } catch (e) {
    status('#server-status', `✗ Couldn't reach the league server${draft.server.url ? '' : ' from this site'}: ${e.message}`, 'warn');
    return false;
  }
}

// ---------- save ----------
async function save() {
  if (busy) return;
  busy = true;
  const btn = $('#ai-save');
  btn.disabled = true;
  try {
    if (draft.tier === 'device') {
      status('#ai-status', 'Getting the model ready. Keep this screen open…');
      await downloadModel();
    }
    if (draft.tier === 'provider' && !(await testProvider())) throw new Error('Fix the provider settings above, then try again.');
    if (draft.tier === 'server' && !(await testServer())) throw new Error('The league server could not be reached.');
    draft.chosen = true;
    saveSettings(draft);
    ctx.onSaved(structuredClone(draft));
    status('#ai-status', '');
    $('#ai-panel').close();
  } catch (e) {
    status('#ai-status', e.message || String(e), 'warn');
    $('#device-progress').hidden = true;
  } finally {
    busy = false;
    btn.disabled = false;
  }
}
