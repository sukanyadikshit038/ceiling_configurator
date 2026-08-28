// Texture library admin — upload, preview and delete fabric textures.
// Talks to the /api/textures endpoints in scripts/serve.js.

const $ = id => document.getElementById(id);
const nameEl = $('tex-name');
const fileEl = $('tex-file');
const scaleEl = $('tex-scale');
const scaleVal = $('scale-val');
const previewEl = $('upload-preview');
const msgEl = $('upload-msg');
const gridEl = $('tex-grid');
const emptyEl = $('lib-empty');

const MAX_BYTES = 8 * 1024 * 1024;
let pendingDataUrl = null;

function setMsg(text, isError = false) {
  msgEl.textContent = text;
  msgEl.style.color = isError ? 'var(--danger)' : 'var(--accent)';
}

scaleEl.addEventListener('input', () => {
  scaleVal.textContent = `${parseFloat(scaleEl.value).toFixed(2)} m`;
});

fileEl.addEventListener('change', () => {
  pendingDataUrl = null;
  previewEl.style.display = 'none';
  const file = fileEl.files[0];
  if (!file) return;
  if (file.size > MAX_BYTES) {
    setMsg('File is larger than 8 MB — please downscale it first.', true);
    fileEl.value = '';
    return;
  }
  const reader = new FileReader();
  reader.onload = () => {
    pendingDataUrl = reader.result;
    previewEl.style.backgroundImage = `url(${pendingDataUrl})`;
    previewEl.style.display = 'block';
    setMsg('');
    if (!nameEl.value) nameEl.value = file.name.replace(/\.[^.]+$/, '').replace(/[-_]/g, ' ');
  };
  reader.readAsDataURL(file);
});

$('upload-btn').addEventListener('click', async () => {
  if (!pendingDataUrl) return setMsg('Choose an image first.', true);
  const name = nameEl.value.trim() || 'Untitled';
  // take the payload and disable the button so a double-click can't double-post
  const dataUrl = pendingDataUrl;
  pendingDataUrl = null;
  const btn = $('upload-btn');
  btn.disabled = true;
  setMsg('Uploading…');
  try {
    const res = await fetch('/api/textures', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, scale: parseFloat(scaleEl.value), dataUrl }),
    });
    if (!res.ok) throw new Error((await res.json()).error || res.statusText);
    setMsg(`“${name}” added to the library.`);
    nameEl.value = '';
    fileEl.value = '';
    previewEl.style.display = 'none';
    refresh();
  } catch (err) {
    pendingDataUrl = dataUrl; // allow retrying the same file
    setMsg('Upload failed: ' + err.message, true);
  } finally {
    btn.disabled = false;
  }
});

async function removeTexture(id, name) {
  if (!confirm(`Delete “${name}”? Items using it fall back to their felt colour.`)) return;
  await fetch(`/api/textures?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
  refresh();
}

async function refresh() {
  let list = [];
  try {
    list = await (await fetch('/api/textures')).json();
  } catch { /* server offline */ }
  gridEl.replaceChildren();
  emptyEl.hidden = list.length > 0;
  for (const tex of list) {
    const card = document.createElement('div');
    card.className = 'tex-card';
    const thumb = document.createElement('div');
    thumb.className = 'tex-thumb';
    thumb.style.backgroundImage = `url(/textures/${tex.file})`;
    const meta = document.createElement('div');
    meta.className = 'tex-meta';
    const label = document.createElement('div');
    const title = document.createElement('span');
    title.textContent = tex.name;
    const sub = document.createElement('small');
    sub.textContent = `tile ${Number(tex.scale).toFixed(2)} m`;
    label.append(title, sub);
    const del = document.createElement('button');
    del.className = 'danger';
    del.textContent = 'Delete';
    del.addEventListener('click', () => removeTexture(tex.id, tex.name));
    meta.append(label, del);
    card.append(thumb, meta);
    gridEl.append(card);
  }
}

refresh();
