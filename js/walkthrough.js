// Cinematic walkthrough recorder v2 — composites the REAL app frame
// (toolbar + sidebar rasterized from the DOM via html2canvas + the 3D
// viewport) into a deterministic storyboard, encodes H.264 via WebCodecs
// and POSTs the MP4 to the dev server (/__video → walkthrough.mp4).
// Dev/QA tool: run with (await import('/js/walkthrough.js')).run(window.__acfg)
import { CUSTOM_TEXTURES } from './textures.js';

const FPS = 30;
const W = 1280, H = 720;
const TB_H = 48, SB_W = 292;           // toolbar height / sidebar width in the video
const VP_W = W - SB_W, VP_H = H - TB_H; // 3D viewport region (988 × 672)
const DURATION = 62; // seconds

const ease = t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const lerp = (a, b, k) => a + (b - a) * k;
const clamp01 = v => Math.max(0, Math.min(1, v));

// unthrottled yield (setTimeout is throttled to 1 Hz in hidden tabs)
function yieldTask() {
  return new Promise(resolve => {
    const mc = new MessageChannel();
    mc.port1.onmessage = () => resolve();
    mc.port2.postMessage(0);
  });
}

// ---------- camera timeline (lerp segments; 'orbit' segments circle a point) ----------
const CAM = [
  { t0: 0.0,  t1: 3.5,  p0: [7, 1.6, 6.8],    p1: [7, 1.6, 6.8],    g0: [0, 2.8, 0],      g1: [0, 2.8, 0] },
  { t0: 3.5,  t1: 10.0, p0: [7, 1.6, 6.8],    p1: [4.5, 1.9, 5.0],  g0: [0, 2.8, 0],      g1: [0, 2.95, 0] },
  { t0: 10.0, t1: 17.0, p0: [5.5, 1.4, 5.0],  p1: [-2.2, 1.3, 4.2], g0: [0, 3.05, 0],     g1: [-0.5, 3.15, -1] },
  { t0: 17.0, t1: 24.0, p0: [4.5, 1.5, 4.5],  p1: [-3.5, 1.9, 3.4], g0: [0.3, 2.95, 0],   g1: [0.3, 3.0, 0.2] },
  { t0: 24.0, t1: 30.0, p0: [0, 1.15, 4.6],   p1: [3.2, 1.7, -2.6], g0: [0, 3.25, -1],    g1: [-0.8, 3.15, 0.5] },
  { t0: 30.0, t1: 36.0, p0: [1.5, 1.4, 3.9],  p1: [4.4, 2.2, 3.6],  g0: [-2, 3.05, -0.6], g1: [0.8, 3.05, 0.3] },
  { t0: 36.0, t1: 42.0, p0: [2.5, 1.35, 4.0], p1: [-3.0, 2.2, -2.4], g0: [-1, 3.3, 0],    g1: [1, 3.3, 1] },
  { t0: 42.0, t1: 46.5, orbit: { r0: 6.2, r1: 5.4, a0: 0.7, a1: 3.0, y0: 1.6, y1: 2.4, g: [0, 2.9, 0] } },
  { t0: 46.5, t1: 51.0, p0: [0, 1.2, 3.4],    p1: [0, 1.1, 1.0],    g0: [0, 3.3, -1.4],   g1: [0, 3.38, -0.3] },
  { t0: 51.0, t1: 62.0, p0: [0.01, 5.2, 0.5], p1: [0.01, 12.6, 0.55], g0: [0, 3.4, 0],    g1: [0, 3.4, 0] },
];

const CAPTIONS = [
  { t0: 4.2,  t1: 9.6,  text: 'The full workspace — products, presets, properties & room setup in the side panel' },
  { t0: 10.6, t1: 13.2, text: 'Select a product — every setting is explained in the panel guide' },
  { t0: 13.6, t1: 16.6, text: 'Adjust fin depth, spacing or drop — the scene updates live' },
  { t0: 17.5, t1: 23.5, text: 'Clouds — rectangle, circle, hex or the sculpted Fly series' },
  { t0: 24.5, t1: 29.5, text: 'Fly scatter with fabric finishes from the Admin panel' },
  { t0: 30.4, t1: 32.9, text: 'Ctrl-click selects several items at once…' },
  { t0: 33.2, t1: 35.8, text: '…and “Duplicate as array” tiles the whole cluster' },
  { t0: 36.5, t1: 41.5, text: 'Perforated wood panels — five tones, four patterns' },
  { t0: 42.4, t1: 46.2, text: 'Orbit view — drag to orbit · scroll to zoom · right-drag to pan' },
  { t0: 46.8, t1: 50.8, text: 'Look up — check the ceiling design from inside the room' },
  { t0: 51.3, t1: 56.4, text: 'Plan view — top-down layout for set-out and spacing' },
];

export function run(A) {
  const job = { frame: 0, total: Math.round(DURATION * FPS), phase: 'starting', error: null, done: false, bytes: 0 };
  window.__walkJob = job;
  runInner(A, job).catch(e => {
    job.error = String((e && e.stack) || e);
    job.done = true;
    restoreApp(A);
  });
  return job;
}

function restoreApp(A) {
  document.body.classList.remove('capture');
  A.controls.enabled = true;
  A.renderer.setAnimationLoop(() => {
    A.controls.update();
    A.renderer.render(A.scene, A.camera);
  });
  A.api.setView('orbit');
  A.resize();
}

async function runInner(A, job) {
  const S = A.state;
  const { default: html2canvas } = await import('https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/+esm');

  const deselect = () => A.api.selectItem(null);
  const commit = (item, patch) => {
    A.api.selectItem(item.id);
    A.api.updateSelected(patch, { commit: true });
  };
  const openGuide = () => {
    const det = document.querySelector('#props-body details.guide');
    if (det && !det.open) {
      det.open = true;
      det.dispatchEvent(new Event('toggle'));
    }
  };

  // ---------- DOM rasterization ----------
  let sbBmp = null, tbBmp = null, sbScale = 1.5;
  async function captureSidebar() {
    document.body.classList.add('capture');
    const inputs = [...document.querySelectorAll('#sidebar input[type=range]')];
    for (const inp of inputs) {
      const pct = ((parseFloat(inp.value) - parseFloat(inp.min)) / (parseFloat(inp.max) - parseFloat(inp.min))) * 100;
      inp.style.background = `linear-gradient(90deg, #24d0a8 ${pct}%, #2a313a ${pct}%)`;
    }
    const sb = document.getElementById('sidebar');
    const saved = { position: sb.style.position, height: sb.style.height, overflow: sb.style.overflow, top: sb.style.top, zIndex: sb.style.zIndex };
    sb.style.position = 'absolute'; sb.style.top = TB_H + 'px'; sb.style.height = 'auto';
    sb.style.overflow = 'visible'; sb.style.zIndex = '-1';
    sbBmp = await html2canvas(sb, { backgroundColor: '#171b21', scale: 1.5, logging: false });
    Object.assign(sb.style, saved);
    sbScale = sbBmp.width / SB_W;
    for (const inp of inputs) inp.style.background = '';
    document.body.classList.remove('capture');
  }
  async function captureToolbar() {
    tbBmp = await html2canvas(document.getElementById('toolbar'), { backgroundColor: '#171b21', scale: 1.5, logging: false });
  }
  const viewButton = name => [...document.querySelectorAll('#tb-views button')].find(b => b.textContent === name);
  async function highlightView(name) {
    for (const b of document.querySelectorAll('#tb-views button')) b.classList.remove('active');
    if (name) viewButton(name)?.classList.add('active');
    await captureToolbar();
  }

  // sidebar crop keyframes (video "scrolls" the panel bitmap)
  let cropKeys = [{ t0: 0, t1: 0, v0: 0, v1: 0 }];
  let propsCrop = 0;
  const cropTo = (t, v, dur = 1.2) => {
    const cur = cropAt(t);
    cropKeys.push({ t0: t, t1: t + dur, v0: cur, v1: v });
  };
  const cropAt = t => {
    let v = 0;
    for (const k of cropKeys) {
      if (t >= k.t1) v = k.v1;
      else if (t >= k.t0) v = lerp(k.v0, k.v1, ease(clamp01((t - k.t0) / (k.t1 - k.t0 || 1))));
    }
    return v;
  };

  // ---------- staged actions ----------
  const fabrics = CUSTOM_TEXTURES.slice(0, 2).map(t => t.id);
  const addFly = (x, z, params) => {
    const it = A.api.addItem('cloud', x, z);
    A.api.updateSelected({ params: { shape: 'fly', width: 1.5, depth: 1.05, ...params } }, {});
    return it;
  };
  let demoIds = [];
  const ACTIONS = [
    { at: 0.05, fn: async () => {
      A.api.setRoom({ w: 12, l: 9, h: 3.4 });
      A.api.clearAll();
      A.api.applyPreset('showroom');
      deselect();
      await highlightView('Orbit');
      await captureSidebar();
    } },
    { at: 10.02, fn: async () => {
      A.api.clearAll();
      A.api.applyPreset('baffle-field');
      A.api.selectItem(S.items[0].id);
      openGuide();
      await captureSidebar();
      propsCrop = Math.max(0, document.getElementById('panel-props').offsetTop - 8);
      cropTo(10.5, propsCrop, 1.4);
    } },
    { at: 13.6, fn: async () => { commit(S.items[0], { params: { height: 0.6 } }); openGuide(); await captureSidebar(); } },
    { at: 15.2, fn: async () => { commit(S.items[0], { params: { height: 0.8, drop: 0.65 } }); openGuide(); await captureSidebar(); } },
    { at: 17.02, fn: async () => {
      A.api.clearAll();
      A.api.applyPreset('cloud-cluster');
      const c = S.items.find(i => i.type === 'cloud' && i.params.shape === 'circle');
      A.api.selectItem(c.id);
      await captureSidebar();
    } },
    { at: 19.6, fn: async () => {
      const sel = S.items.find(i => i.id === S.selectedIds[0]);
      if (sel) commit(sel, { params: { shape: 'hex' } });
      await captureSidebar();
    } },
    { at: 21.6, fn: async () => {
      const sel = S.items.find(i => i.id === S.selectedIds[0]);
      if (sel) commit(sel, { params: { shape: 'fly', tilt: 12 } });
      await captureSidebar();
    } },
    { at: 24.02, fn: async () => {
      A.api.clearAll();
      A.api.applyPreset('fly-scatter');
      const flies = S.items.filter(i => i.params.shape === 'fly');
      if (fabrics.length) {
        flies.slice(0, 3).forEach((it, i) => commit(it, { params: { texture: fabrics[i % fabrics.length] } }));
        A.api.selectItem(flies[0].id);
      } else {
        A.api.selectItem(flies[0].id);
      }
      await captureSidebar();
    } },
    { at: 30.02, fn: async () => {
      A.api.clearAll();
      demoIds = [
        addFly(-2.6, -0.9, { variant: 1, color: '#c65a33', tilt: -12, drop: 0.5 }).id,
        addFly(-1.1, -1.3, { variant: 3, color: '#5b6770', tilt: 14, drop: 0.65 }).id,
        addFly(-1.9, 0.5,  { variant: 5, color: '#c8a13a', tilt: 10, drop: 0.8 }).id,
      ];
      A.api.setSelection(demoIds);
      await captureSidebar();
    } },
    { at: 33.1, fn: () => A.api.arraySelected(2, 3, 3.0, 3.2) },
    { at: 36.02, fn: async () => {
      A.api.clearAll();
      A.api.applyPreset('panel-grid');
      const mid = S.items[Math.floor(S.items.length / 2)];
      A.api.selectItem(mid.id);
      await captureSidebar();
    } },
    { at: 38.9, fn: async () => {
      S.items.filter(i => i.type === 'panel').forEach((it, i) => {
        if (i % 2 === 0) commit(it, { params: { tone: 'Walnut', perf: 'slots' } });
      });
      const mid = S.items[Math.floor(S.items.length / 2)];
      A.api.selectItem(mid.id);
      await captureSidebar();
    } },
    { at: 42.02, fn: async () => {
      A.api.clearAll();
      A.api.applyPreset('showroom');
      if (fabrics.length) {
        addFly(3.2, -2.6, { variant: 2, color: '#aeb6bc', tilt: 12, drop: 0.55, texture: fabrics[0] });
      }
      deselect();
      cropTo(42.1, 0, 1.0);
      await highlightView('Orbit');
      await captureSidebar();
    } },
    { at: 46.52, fn: () => highlightView('Look up') },
    { at: 51.02, fn: () => highlightView('Plan') },
    { at: 57.5, fn: () => highlightView(null) },
  ];
  let nextAction = 0;

  // ---------- encoder ----------
  job.phase = 'setup';
  const { Muxer, ArrayBufferTarget } = await import('https://cdn.jsdelivr.net/npm/mp4-muxer@5.2.1/+esm');
  const muxer = new Muxer({
    target: new ArrayBufferTarget(),
    video: { codec: 'avc', width: W, height: H },
    fastStart: 'in-memory',
    firstTimestampBehavior: 'offset',
  });
  const encoderErrors = [];
  const encoder = new VideoEncoder({
    output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
    error: e => encoderErrors.push(String(e)),
  });
  encoder.configure({ codec: 'avc1.640028', width: W, height: H, bitrate: 7_000_000, framerate: FPS });

  const cnv = document.createElement('canvas');
  cnv.width = W;
  cnv.height = H;
  const ctx = cnv.getContext('2d');

  A.renderer.setAnimationLoop(null);
  A.controls.enabled = false;
  A.renderer.setSize(VP_W * 1.5, VP_H * 1.5, false);
  A.camera.aspect = VP_W / VP_H;
  A.camera.updateProjectionMatrix();
  const glCanvas = A.renderer.domElement;

  const setCamera = t => {
    const seg = CAM.find(s => t >= s.t0 && t < s.t1) || CAM[CAM.length - 1];
    const k = ease(clamp01((t - seg.t0) / (seg.t1 - seg.t0)));
    if (seg.orbit) {
      const o = seg.orbit;
      const a = lerp(o.a0, o.a1, k);
      A.camera.position.set(Math.cos(a) * lerp(o.r0, o.r1, k), lerp(o.y0, o.y1, k), Math.sin(a) * lerp(o.r0, o.r1, k));
      A.camera.lookAt(o.g[0], o.g[1], o.g[2]);
    } else {
      A.camera.position.set(lerp(seg.p0[0], seg.p1[0], k), lerp(seg.p0[1], seg.p1[1], k), lerp(seg.p0[2], seg.p1[2], k));
      A.camera.lookAt(lerp(seg.g0[0], seg.g1[0], k), lerp(seg.g0[1], seg.g1[1], k), lerp(seg.g0[2], seg.g1[2], k));
    }
  };

  const compose = t => {
    ctx.fillStyle = '#0e1116';
    ctx.fillRect(0, 0, W, H);
    ctx.drawImage(glCanvas, SB_W, TB_H, VP_W, VP_H);
    if (sbBmp) {
      const sy = Math.min(cropAt(t) * sbScale, Math.max(0, sbBmp.height - VP_H * sbScale));
      const sh = Math.min(VP_H * sbScale, sbBmp.height - sy);
      ctx.drawImage(sbBmp, 0, sy, sbBmp.width, sh, 0, TB_H, SB_W, sh / sbScale);
    }
    if (tbBmp) ctx.drawImage(tbBmp, 0, 0, tbBmp.width, tbBmp.height, 0, 0, W, TB_H);
    ctx.strokeStyle = '#2a313a';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(SB_W + 0.5, TB_H);
    ctx.lineTo(SB_W + 0.5, H);
    ctx.stroke();
    drawOverlays(ctx, t);
  };

  job.phase = 'encoding';
  try {
    for (let f = 0; f < job.total; f++) {
      const t = f / FPS;
      while (nextAction < ACTIONS.length && ACTIONS[nextAction].at <= t) {
        await ACTIONS[nextAction].fn();
        nextAction++;
      }
      setCamera(t);
      A.renderer.render(A.scene, A.camera);
      compose(t);
      const vf = new VideoFrame(cnv, {
        timestamp: Math.round(f * 1e6 / FPS),
        duration: Math.round(1e6 / FPS),
      });
      encoder.encode(vf, { keyFrame: f % 60 === 0 });
      vf.close();
      if (encoderErrors.length) throw new Error('encoder: ' + encoderErrors[0]);
      job.frame = f + 1;
      if (encoder.encodeQueueSize > 6 || f % 3 === 0) await yieldTask();
    }
    job.phase = 'flushing';
    await encoder.flush();
    muxer.finalize();
    job.phase = 'uploading';
    const buf = muxer.target.buffer;
    job.bytes = buf.byteLength;
    const res = await fetch('/__video', { method: 'POST', body: buf });
    if (!res.ok) throw new Error('upload failed: ' + res.status);
  } finally {
    for (const b of document.querySelectorAll('#tb-views button')) b.classList.remove('active');
    restoreApp(A);
  }
  job.phase = 'done';
  job.done = true;
}

// ---------- overlays ----------
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

function drawCaption(ctx, text, alpha) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.font = '500 21px "Segoe UI", system-ui, sans-serif';
  const tw = ctx.measureText(text).width;
  const px = 16, py = 11;
  const x = SB_W + 22, y = H - 70;
  ctx.fillStyle = 'rgba(20,24,29,0.9)';
  ctx.strokeStyle = 'rgba(58,68,80,0.9)';
  ctx.lineWidth = 1;
  roundRect(ctx, x, y, tw + px * 2, 21 + py * 2, 10);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#dfe5ea';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x + px, y + py + 11);
  ctx.restore();
}

function drawBrandMark(ctx, x, y, size) {
  const grad = ctx.createLinearGradient(x, y, x + size, y + size);
  grad.addColorStop(0, '#24d0a8');
  grad.addColorStop(1, '#4a90d9');
  ctx.fillStyle = grad;
  roundRect(ctx, x, y, size, size, size * 0.22);
  ctx.fill();
}

function drawCard(ctx, k, subtitle, extra) {
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#14171c');
  bg.addColorStop(1, '#21272f');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);
  ctx.save();
  ctx.globalAlpha = clamp01(k / 0.55);
  const rise = (1 - ease(clamp01(k))) * 22;
  const cy = H / 2 + rise;
  drawBrandMark(ctx, W / 2 - 178, cy - 66, 40);
  ctx.font = '600 60px "Segoe UI", system-ui, sans-serif';
  ctx.fillStyle = '#e6eaee';
  ctx.textBaseline = 'middle';
  ctx.fillText('AcoustiConfig', W / 2 - 122, cy - 46);
  ctx.font = '400 25px "Segoe UI", system-ui, sans-serif';
  ctx.fillStyle = '#9aa4ae';
  const sw = ctx.measureText(subtitle).width;
  ctx.fillText(subtitle, (W - sw) / 2, cy + 22);
  if (extra) {
    ctx.font = '400 19px "Segoe UI", system-ui, sans-serif';
    ctx.fillStyle = '#6f7982';
    const ew = ctx.measureText(extra).width;
    ctx.fillText(extra, (W - ew) / 2, cy + 62);
  }
  ctx.restore();
}

function drawOverlays(ctx, t) {
  if (t < 3.5) {
    drawCard(ctx, t / 1.2, 'Ceiling acoustics configurator — full product walkthrough', '');
    return;
  }
  if (t >= 57) {
    drawCard(ctx, (t - 57) / 1.2, 'Baffles · Clouds · Fly series · Perforated wood',
      'Guided settings · Multi-select arrays · Orbit, Look-up & Plan views · PNG export');
    return;
  }
  for (const cap of CAPTIONS) {
    if (t >= cap.t0 && t <= cap.t1) {
      const alpha = clamp01(Math.min((t - cap.t0) / 0.4, (cap.t1 - t) / 0.4));
      drawCaption(ctx, cap.text, alpha);
    }
  }
}
