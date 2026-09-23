// NP7 projects for the Plate Designer.
//
// The platform adds this script when it serves the tool (see DEPLOYMENT.md,
// "NP7 platform layer"); the tool file itself only knows the browser. This
// puts a project bar on top of it: Save, Save as copy, New, and a Projects
// list with pictures. A project is kept in NP7 (pd_plate_designs, migration
// 258) with the board file, so opening one brings board and plate back in one
// click. It also follows the admin's light or dark theme.
//
// It works through the tool's own functions, never around them: the plate is
// read with the tool's saveDesign() (its download caught) and put back with
// its loadDesign(), so whatever a design file holds, a project holds too.
// Boards are loaded through loadSTL() / loadS3dxFile() like a dropped file.
(function () {
  'use strict';

  var API = '/api/admin/product-dev/plate-designs';
  var MAX_BOARD_BYTES = 50 * 1024 * 1024;

  // ---- the tool this was written against (v22) ------------------------------
  var NEED = ['loadSTL', 'loadS3dxFile', 'onBoardLoaded', 'onS3dxLoaded', 'saveDesign', 'loadDesign',
    'defaultPlate', 'rebuildPlates', 'rebuildSceneHelpers', 'renderPlateTab', 'switchTab',
    'renderDetectionControls', 'syncTailButtons', 'detectCutouts', 'renderS3dxControls', 's3dxRebuild'];
  var missing = NEED.filter(function (n) { return typeof window[n] !== 'function'; });
  try {
    void [plateA, plateB, detection, detectedCutouts, s3dxData, s3dxParams, boardGeometry, boardGroup, plateGroup, helperGroup, scene, renderer];
  } catch { missing.push('tool state'); }

  var toolLoadSTL = window.loadSTL, toolLoadS3dx = window.loadS3dxFile;
  var toolOnBoard = window.onBoardLoaded, toolOnS3dx = window.onS3dxLoaded;
  var toolSaveDesign = window.saveDesign, toolLoadDesign = window.loadDesign;

  var np7 = {
    project: null,   // the open project (list columns + board_file_sha256)
    board: null,     // the board file loaded in the tool: { file, kind, name, size, sha256 }
    pending: null,   // a board file on its way in
    flipped: false,  // STL turned upside down with the tool's flip button
    savedSnap: null, // what the open project looked like when opened or saved
    baseSnap: null,  // the empty tool: nothing to save yet
    snap: null,
    busy: false,
    list: [],
  };

  // ---- small helpers --------------------------------------------------------
  function $(id) { return document.getElementById(id); }
  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  function mb(bytes) { return (bytes / 1048576).toFixed(bytes < 10485760 ? 1 : 0) + ' MB'; }
  function when(iso) {
    if (!iso) return '';
    var d = new Date(iso), now = new Date();
    var time = d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
    if (d.toDateString() === now.toDateString()) return time;
    return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: d.getFullYear() === now.getFullYear() ? undefined : '2-digit' }) + ' ' + time;
  }

  async function api(method, url, body) {
    var res = await fetch(url, {
      method: method,
      credentials: 'same-origin',
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    var json = {};
    try { json = await res.json(); } catch { /* empty answer */ }
    if (res.status === 401) json.error = 'You are signed out. Sign in to the admin again, then retry.';
    return { ok: res.ok, status: res.status, json: json };
  }

  async function sha256Of(file) {
    var buf = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
    return Array.from(new Uint8Array(buf)).map(function (b) { return b.toString(16).padStart(2, '0'); }).join('');
  }

  // ---- reading and writing the tool -----------------------------------------

  // The tool's own "Save design", with its download caught: exactly the JSON
  // it would have written to plate_design.json.
  async function toolDesign() {
    var captured = null;
    var status = $('design-status'), before = status ? status.innerHTML : '';
    var createURL = URL.createObjectURL, click = HTMLAnchorElement.prototype.click;
    URL.createObjectURL = function (blob) { captured = blob; return 'blob:np7-capture'; };
    HTMLAnchorElement.prototype.click = function () {};
    try { toolSaveDesign(); }
    finally {
      URL.createObjectURL = createURL;
      HTMLAnchorElement.prototype.click = click;
      if (status) status.innerHTML = before;
    }
    if (!captured) return null;
    return JSON.parse(await captured.text());
  }

  // What the design file does not hold: how the board was set up.
  function currentSetup() {
    return {
      board: np7.board ? { kind: np7.board.kind, name: np7.board.name, size: np7.board.size } : null,
      s3dx: s3dxData ? Object.assign({}, s3dxParams) : null,
      flipped: np7.flipped,
    };
  }

  function snapOf(design, setup, name) {
    var d = Object.assign({}, design);
    delete d.savedAt;
    return JSON.stringify([d, setup, name || '']);
  }

  async function takeSnap() {
    var design = await toolDesign();
    return { design: design, setup: currentSetup(), snap: design ? snapOf(design, currentSetup(), nameInput.value.trim()) : null };
  }

  // Board loads go through the tool, so a dropped file and an opened project
  // take the same road. The wrappers only remember which file it was.
  window.loadSTL = function (file) {
    if (!np7.pending || np7.pending.file !== file) np7.pending = { file: file, kind: 'stl' };
    return toolLoadSTL.apply(this, arguments);
  };
  window.loadS3dxFile = function (file) {
    if (!np7.pending || np7.pending.file !== file) np7.pending = { file: file, kind: 's3dx' };
    return toolLoadS3dx.apply(this, arguments);
  };
  window.onBoardLoaded = function () {
    // An STL replaces whatever Shape3D board was there before.
    if (s3dxData) {
      s3dxData = null;
      $('s3dx-controls').classList.add('hidden');
      $('s3dx-status').innerHTML = '';
    }
    var out = toolOnBoard.apply(this, arguments);
    np7.flipped = false;
    finishBoard('stl', true);
    return out;
  };
  window.onS3dxLoaded = function () {
    var before = s3dxData;
    var out = toolOnS3dx.apply(this, arguments);
    var ok = !!s3dxData && s3dxData !== before;
    if (ok) {
      np7.flipped = false;
      // Mesh detection means nothing for a Shape3D board.
      $('detection-controls').classList.add('hidden');
      $('upload-status').innerHTML = '';
    }
    finishBoard('s3dx', ok);
    return out;
  };
  function finishBoard(kind, ok) {
    var p = np7.pending;
    np7.pending = null;
    if (ok) {
      np7.board = p && p.kind === kind
        ? { file: p.file, kind: kind, name: p.file.name, size: p.file.size, sha256: p.sha256 || null }
        : null;
    }
    if (p && p.resolve) {
      clearTimeout(p.timer);
      if (ok) p.resolve();
      else p.reject(new Error(($(kind === 'stl' ? 'upload-status' : 's3dx-status').textContent || 'The board file could not be read.').trim()));
    }
    scheduleCheck();
  }

  function loadBoard(file, kind, sha256) {
    return new Promise(function (resolve, reject) {
      var p = { file: file, kind: kind, sha256: sha256, resolve: resolve, reject: reject };
      p.timer = setTimeout(function () {
        if (np7.pending === p) { np7.pending = null; reject(new Error('The board file could not be read.')); }
      }, 60000);
      np7.pending = p;
      (kind === 'stl' ? window.loadSTL : window.loadS3dxFile)(file);
    });
  }

  // The tool's flip button turns an STL over (never a Shape3D board).
  $('flip-board-btn').addEventListener('click', function () {
    if (!s3dxData && boardGeometry) { np7.flipped = !np7.flipped; scheduleCheck(); }
  });

  // The design file holds the cut-out detection settings, but the tool's own
  // "Load design" leaves them alone (a design may go onto another board). For
  // the project's own board they are part of the result, so they come back.
  function restoreDetection(saved) {
    if (!saved) return;
    Object.keys(saved).forEach(function (k) {
      if (k in detection && typeof saved[k] === typeof detection[k]) detection[k] = saved[k];
    });
    renderDetectionControls();
    syncTailButtons();
    rebuildSceneHelpers();
  }

  function restoreS3dx(saved) {
    if (!saved || !s3dxData) return;
    Object.keys(saved).forEach(function (k) {
      if (k in s3dxParams && typeof saved[k] === 'number' && isFinite(saved[k])) s3dxParams[k] = saved[k];
    });
    if (!s3dxData.layers[s3dxParams.layerIndex]) s3dxParams.layerIndex = 0;
    var sel = $('s3dx-layer');
    if (sel) sel.value = String(s3dxParams.layerIndex);
    renderS3dxControls();
    s3dxRebuild();
  }

  // The tool's own "Load design", fed the stored JSON as a file.
  function applyDesign(design) {
    return new Promise(function (resolve, reject) {
      var before = plateA, status = $('design-status'), started = Date.now();
      status.innerHTML = '';
      toolLoadDesign(new File([JSON.stringify(design)], 'plate_design.json', { type: 'application/json' }));
      (function check() {
        if (plateA !== before) return resolve();
        if (status.querySelector('.text-red-600')) return reject(new Error(status.textContent.trim()));
        if (Date.now() - started > 10000) return reject(new Error('The plate could not be loaded.'));
        setTimeout(check, 25);
      })();
    });
  }

  function clearBoard() {
    while (boardGroup.children.length) {
      var c = boardGroup.children[0];
      boardGroup.remove(c);
      if (c.geometry) c.geometry.dispose();
      if (c.material) c.material.dispose();
    }
    boardGeometry = null;
    boardBounds = null;
    boardMesh = null;
    s3dxData = null;
    detectedCutouts = { A: null, B: null };
    loadedCutoutRef = null;
    ['board-controls', 'detection-controls', 's3dx-controls'].forEach(function (id) { $(id).classList.add('hidden'); });
    ['upload-status', 's3dx-status', 'detection-result', 'design-status', 'export-status'].forEach(function (id) { if ($(id)) $(id).innerHTML = ''; });
    if ($('s3dx-layer')) $('s3dx-layer').innerHTML = '';
    $('export-a-btn').disabled = true;
    $('export-b-btn').disabled = true;
    np7.board = null;
    np7.flipped = false;
    plateA = defaultPlate();
    plateB = defaultPlate();
    rebuildSceneHelpers();
    rebuildPlates();
    if (currentTab === 'plate-a') renderPlateTab('a');
  }

  // A picture for the project list: the plates seen from above, in the tool's
  // own colours, rendered off-screen so the 3D view does not flicker.
  function captureThumb() {
    try {
      var target = plateGroup.children.length ? plateGroup : (boardMesh ? boardGroup : null);
      if (!target) return null;
      var box = new THREE.Box3().setFromObject(target);
      if (box.isEmpty()) return null;
      var W = 360, H = 225, S = 2;
      var c = box.getCenter(new THREE.Vector3()), s = box.getSize(new THREE.Vector3());
      var spanX = s.x * 1.15 + 30, spanZ = s.z * 1.15 + 30;
      if (spanX / spanZ > W / H) spanZ = spanX * H / W; else spanX = spanZ * W / H;
      var cam = new THREE.OrthographicCamera(-spanX / 2, spanX / 2, spanZ / 2, -spanZ / 2, 1, 100000);
      cam.up.set(0, 0, -1);
      cam.position.set(c.x, box.max.y + 3000, c.z);
      cam.lookAt(c.x, c.y, c.z);
      cam.updateProjectionMatrix();

      var hide = scene.children.filter(function (o) {
        return o.visible && (o.type === 'GridHelper' || o.type === 'AxesHelper' || o === helperGroup);
      });
      var bg = scene.background;
      var rt = new THREE.WebGLRenderTarget(W * S, H * S);
      var px = new Uint8Array(W * S * H * S * 4);
      // The plates sit down in the recess, under the board's surface: see
      // them through a see-through board, like the Transparent button does.
      var mat = boardMesh && boardMesh.material;
      var was = mat ? { t: mat.transparent, o: mat.opacity, d: mat.depthWrite } : null;
      hide.forEach(function (o) { o.visible = false; });
      scene.background = new THREE.Color(0xe2e8f0);
      if (mat) { mat.transparent = true; mat.opacity = 0.35; mat.depthWrite = false; mat.needsUpdate = true; }
      try {
        renderer.setRenderTarget(rt);
        renderer.render(scene, cam);
        renderer.readRenderTargetPixels(rt, 0, 0, W * S, H * S, px);
      } finally {
        renderer.setRenderTarget(null);
        rt.dispose();
        scene.background = bg;
        hide.forEach(function (o) { o.visible = true; });
        if (mat) { mat.transparent = was.t; mat.opacity = was.o; mat.depthWrite = was.d; mat.needsUpdate = true; }
      }
      var big = document.createElement('canvas');
      big.width = W * S; big.height = H * S;
      var bctx = big.getContext('2d');
      var img = bctx.createImageData(W * S, H * S), row = W * S * 4;
      for (var y = 0; y < H * S; y++) img.data.set(px.subarray((H * S - 1 - y) * row, (H * S - y) * row), y * row);
      bctx.putImageData(img, 0, 0);
      var out = document.createElement('canvas');
      out.width = W; out.height = H;
      var octx = out.getContext('2d');
      octx.imageSmoothingQuality = 'high';
      octx.drawImage(big, 0, 0, W, H);
      var url = out.toDataURL('image/webp', 0.82);
      if (url.indexOf('data:image/webp') !== 0) url = out.toDataURL('image/jpeg', 0.85);
      return url.length < 190000 ? url : null;
    } catch {
      return null;
    }
  }

  // ---- the project bar ------------------------------------------------------
  // Styled with the tool's own NP7 look (np-* classes and tokens), plus the few
  // rules only this bar and the projects list need.
  var css = el('style');
  css.textContent = [
    '.npp-bar{margin:12px 16px 4px;padding:10px;border-radius:14px;border:1px solid var(--line);background:var(--surface-2)}',
    'html.np-embedded .npp-bar{margin-top:14px}',
    '.npp-line{display:flex;align-items:center;gap:8px}',
    '.npp-name{flex:1;min-width:0;font:inherit;font-size:14px;font-weight:600;color:var(--text);background:transparent;border:1px solid transparent;border-radius:8px;padding:5px 8px;outline:none;transition:border-color .15s,background .15s}',
    '.npp-name:hover{border-color:var(--line-strong)}',
    '.npp-name:focus{border-color:var(--tone);background:var(--surface);box-shadow:0 0 0 3px var(--tone-bg)}',
    '.npp-name::placeholder{color:var(--faint);font-weight:500}',
    '.npp-sub{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-top:6px;padding-left:2px;font-size:11.5px}',
    '.npp-status{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
    '.npp-links{display:flex;align-items:center;gap:12px;flex-shrink:0}',
    '.npp-ok{color:var(--tone-ok,#15803d)}html[data-theme="dark"] .npp-ok{color:#86efac}',
    '.npp-warn{color:#b45309}html[data-theme="dark"] .npp-warn{color:#fcd34d}',
    '.npp-err{color:var(--bad)}.npp-busy{color:var(--tone)}.npp-quiet{color:var(--faint)}',
    '.npp-overlay{position:fixed;inset:0;z-index:60;display:none;align-items:center;justify-content:center;padding:16px;background:rgba(15,23,42,.5);backdrop-filter:blur(2px)}',
    '.npp-overlay.is-open{display:flex}',
    '.npp-modal{width:100%;max-width:760px;max-height:85vh;display:flex;flex-direction:column;overflow:hidden;border-radius:18px;background:var(--surface);border:1px solid var(--line);box-shadow:0 24px 70px rgba(0,0,0,.35)}',
    '.npp-mhead{display:flex;align-items:center;gap:12px;padding:16px 18px;border-bottom:1px solid var(--line)}',
    '.npp-mhead h2{font-size:15px;font-weight:700;color:var(--text)}.npp-mhead p{font-size:11.5px;color:var(--muted)}',
    '.npp-search{margin-left:auto;width:190px}',
    '.npp-close{font-size:22px;line-height:1;color:var(--faint);padding:0 4px}.npp-close:hover{color:var(--text)}',
    '.npp-list{flex:1;overflow-y:auto;padding:14px;display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:10px;align-content:start}',
    '.npp-card{position:relative;display:flex;border:1px solid var(--line);border-radius:14px;overflow:hidden;cursor:pointer;background:var(--surface);transition:border-color .15s,box-shadow .15s}',
    '.npp-card:hover{border-color:var(--tone-line);box-shadow:var(--shadow)}',
    '.npp-card.is-current{border-color:var(--tone);box-shadow:0 0 0 3px var(--tone-bg)}',
    '.npp-pic{width:120px;height:78px;flex-shrink:0;background:var(--surface-2);display:flex;align-items:center;justify-content:center;border-right:1px solid var(--line)}',
    '.npp-pic img{width:100%;height:100%;object-fit:cover}',
    '.npp-text{min-width:0;flex:1;padding:9px 12px}',
    '.npp-title{font-size:13px;font-weight:600;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;padding-right:22px}',
    '.npp-meta{font-size:11px;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:3px;display:flex;align-items:center;gap:6px}',
    '.npp-when{font-size:11px;color:var(--faint);margin-top:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    '.npp-del{position:absolute;top:6px;right:6px;opacity:0}.npp-card:hover .npp-del{opacity:1}',
    '.npp-empty{grid-column:1/-1;text-align:center;padding:48px 16px;font-size:13px;color:var(--muted)}',
    '.npp-mfoot{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 18px;border-top:1px solid var(--line);font-size:11.5px;color:var(--muted)}',
  ].join('\n');
  document.head.append(css);

  var ICON_FOLDER = '<svg class="np-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"/></svg>';
  var ICON_SAVE = '<svg class="np-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';

  var header = $('np-head') || document.querySelector('#app > :first-child > :first-child');
  var bar = el('div', 'npp-bar t-violet');
  bar.id = 'np7-projects-bar';
  var line1 = el('div', 'npp-line');
  var openBtn = el('button', 'np-btn np-btn-ghost np-btn-sm');
  openBtn.innerHTML = ICON_FOLDER + 'Projects';
  openBtn.title = 'Open a saved project';
  var nameInput = el('input', 'npp-name');
  nameInput.placeholder = 'Untitled plate';
  nameInput.title = 'Project name';
  var saveBtn = el('button', 'np-btn np-btn-solid np-btn-sm');
  saveBtn.innerHTML = ICON_SAVE + 'Save';
  saveBtn.title = 'Save the project in NP7, with its board file (Cmd/Ctrl + S)';
  line1.append(openBtn, nameInput, saveBtn);
  var line2 = el('div', 'npp-sub');
  var statusEl = el('span', 'npp-status npp-quiet');
  var links = el('span', 'npp-links');
  var copyBtn = el('button', 'np-link', 'Save as copy');
  var newBtn = el('button', 'np-link', 'New');
  newBtn.title = 'Start an empty project';
  links.append(copyBtn, newBtn);
  line2.append(statusEl, links);
  bar.append(line1, line2);

  if (!header) return;
  header.insertAdjacentElement('afterend', bar);

  if (missing.length) {
    [openBtn, saveBtn, copyBtn, newBtn, nameInput].forEach(function (b) { b.disabled = true; });
    statusEl.className = 'npp-status npp-err';
    statusEl.textContent = 'Projects are off: this version of the tool is not supported (' + missing.join(', ') + ').';
    return;
  }

  var message = null; // { text, tone } shown until the next action

  function renderStatus() {
    var text, tone;
    if (np7.busy) { text = np7.busy; tone = 'busy'; }
    else if (message) { text = message.text; tone = message.tone; }
    else if (!np7.project) {
      var fresh = np7.snap === np7.baseSnap && !np7.board;
      text = fresh ? 'Save keeps board and plate together in NP7' : '● Not saved yet';
      tone = fresh ? 'quiet' : 'warn';
    } else if (np7.snap && np7.snap !== np7.savedSnap) {
      text = '● Unsaved changes'; tone = 'warn';
    } else {
      text = '✓ Saved ' + when(np7.project.updated_at) + (np7.project.updated_by ? ' by ' + np7.project.updated_by : '');
      tone = 'ok';
    }
    statusEl.className = 'npp-status npp-' + tone;
    statusEl.textContent = text;
    statusEl.title = text;
    [openBtn, saveBtn, copyBtn, newBtn].forEach(function (b) { b.disabled = !!np7.busy; });
    copyBtn.classList.toggle('hidden', !np7.project);
    document.title = (np7.project ? (nameInput.value.trim() || np7.project.name) + ' · ' : '') + 'NP7 Plate Designer';
  }

  function isDirty() {
    if (!np7.snap) return false;
    return np7.project ? np7.snap !== np7.savedSnap : (np7.snap !== np7.baseSnap || !!np7.board);
  }

  function tellParent() {
    if (window.parent === window) return;
    window.parent.postMessage({
      type: 'np7-plate-project',
      id: np7.project ? np7.project.id : null,
      name: np7.project ? np7.project.name : null,
      dirty: isDirty(),
    }, location.origin);
  }

  function setUrl() {
    var url = new URL(location.href);
    if (np7.project) url.searchParams.set('project', np7.project.id); else url.searchParams.delete('project');
    history.replaceState(null, '', url);
    tellParent();
  }

  function setBusy(text) { np7.busy = text; message = null; renderStatus(); }
  function done(msg, tone) { np7.busy = false; message = msg ? { text: msg, tone: tone || 'ok' } : null; renderStatus(); }

  var checking = false, checkTimer = null, wasDirty = false;
  async function check() {
    if (checking || np7.busy) return;
    checking = true;
    try {
      var s = await takeSnap();
      if (s.snap) np7.snap = s.snap;
      if (message && message.tone !== 'err' && np7.snap !== np7.savedSnap) message = null;
      renderStatus();
      var d = isDirty();
      if (d !== wasDirty) { wasDirty = d; tellParent(); }
    } catch { /* the next check will do */ }
    finally { checking = false; }
  }
  function scheduleCheck() { clearTimeout(checkTimer); checkTimer = setTimeout(check, 400); }
  ['input', 'change', 'pointerup', 'keyup', 'drop'].forEach(function (ev) { document.addEventListener(ev, scheduleCheck, true); });
  setInterval(check, 4000);

  // ---- save -----------------------------------------------------------------
  async function ensureUploaded(b) {
    var r = await api('POST', API + '/board-file', { sha256: b.sha256, kind: b.kind, name: b.name, size: b.size });
    if (!r.ok) throw new Error(r.json.error || 'The board file could not be prepared (' + r.status + ').');
    if (r.json.exists) return;
    setBusy('Uploading the board file (' + mb(b.size) + ')…');
    var put = await fetch(r.json.uploadUrl, {
      method: 'PUT',
      headers: { 'content-type': b.kind === 'stl' ? 'model/stl' : 'application/xml', 'x-upsert': 'false' },
      body: b.file,
    });
    if (!put.ok) {
      var t = await put.text().catch(function () { return ''; });
      // Same board, uploaded by somebody else a moment ago: that is fine.
      if (!/exist|duplicate/i.test(t)) throw new Error('The board file upload failed (' + put.status + ').');
    }
  }

  function defaultName() {
    var n = np7.board ? np7.board.name.replace(/\.(stl|s3dx|xml)$/i, '') : '';
    return n ? n + ' plate' : 'New plate';
  }

  async function save(asCopy) {
    if (np7.busy) return;
    var name = nameInput.value.trim();
    if (!np7.project || asCopy) {
      var typed = window.prompt(asCopy ? 'Name of the copy' : 'Name this project', asCopy ? (name || np7.project.name) + ' copy' : (name || defaultName()));
      if (typed == null || !typed.trim()) return;
      name = typed.trim();
      nameInput.value = name;
    } else if (!name) {
      name = np7.project.name;
      nameInput.value = name;
    }

    setBusy('Saving…');
    var warn = '';
    try {
      var s = await takeSnap();
      if (!s.design) throw new Error('The tool did not hand over the design.');
      var body = { name: name, design: s.design, setup: s.setup, thumb: captureThumb() };

      var b = np7.board;
      if (b && b.size > MAX_BOARD_BYTES) {
        warn = ' The board file is over 50 MB, so it was not kept: load it by hand next time.';
      } else if (b) {
        if (!b.sha256) { setBusy('Reading the board file…'); b.sha256 = await sha256Of(b.file); }
        var keep = np7.project && !asCopy && np7.project.board_file_sha256 === b.sha256;
        if (!keep) {
          await ensureUploaded(b);
          body.board = { sha256: b.sha256, kind: b.kind, name: b.name, size: b.size };
        }
      } else if (asCopy && np7.project && np7.project.board_file_sha256) {
        // A copy of a project whose board is not loaded right now keeps its board.
        var p = np7.project;
        body.board = { sha256: p.board_file_sha256, kind: p.board_file_kind, name: p.board_file_name, size: p.board_file_size };
      }

      setBusy('Saving…');
      var r;
      if (np7.project && !asCopy) {
        r = await api('PATCH', API + '/' + np7.project.id, Object.assign({ base_updated_at: np7.project.updated_at }, body));
        if (r.status === 409 && r.json.conflict) {
          var mine = window.confirm((r.json.updated_by || 'Someone') + ' saved "' + np7.project.name + '" at ' + when(r.json.updated_at)
            + ', after you opened it.\n\nOK: replace it with your version.\nCancel: keep theirs and save yours as a copy.');
          if (mine) {
            r = await api('PATCH', API + '/' + np7.project.id, body);
          } else {
            body.name = name + ' (my version)';
            if (!body.board && np7.project.board_file_sha256) {
              body.board = { sha256: np7.project.board_file_sha256, kind: np7.project.board_file_kind, name: np7.project.board_file_name, size: np7.project.board_file_size };
            }
            r = await api('POST', API, body);
            nameInput.value = body.name;
          }
        }
      } else {
        r = await api('POST', API, body);
      }
      if (!r.ok) throw new Error(r.json.error || 'Saving failed (' + r.status + ').');

      np7.project = r.json;
      np7.savedSnap = snapOf(s.design, s.setup, nameInput.value.trim());
      np7.snap = np7.savedSnap;
      setUrl();
      done(warn ? '✓ Saved.' + warn : null, warn ? 'warn' : null);
      scheduleCheck();
    } catch (e) {
      done(e.message || 'Saving failed.', 'err');
    }
  }

  // ---- open -----------------------------------------------------------------
  async function openProject(id, skipAsk) {
    if (np7.busy) return;
    await check();
    if (!skipAsk && isDirty() && !window.confirm('Your changes are not saved. Open the other project anyway?')) return;
    closeList();
    setBusy('Opening…');
    try {
      var r = await api('GET', API + '/' + encodeURIComponent(id));
      if (!r.ok) throw new Error(r.json.error || 'Could not open the project (' + r.status + ').');
      var p = r.json;
      clearBoard();
      var problem = '';
      if (p.board_url) {
        setBusy('Loading the board ' + (p.board_file_name || '') + '…');
        try {
          var res = await fetch(p.board_url);
          if (!res.ok) throw new Error('The board file could not be downloaded (' + res.status + ').');
          var file = new File([await res.blob()], p.board_file_name || 'board.' + p.board_file_kind);
          await loadBoard(file, p.board_file_kind, p.board_file_sha256);
          if (p.board_file_kind === 'stl') {
            if (p.setup && p.setup.flipped) $('flip-board-btn').click();
            restoreDetection(p.design && p.design.detection);
            detectCutouts();
          } else {
            restoreS3dx(p.setup && p.setup.s3dx);
          }
        } catch (e) {
          problem = (e.message || 'The board did not load.') + ' Load the board by hand.';
        }
      } else {
        problem = 'This project has no board file. Load the board, then Save to keep it with the project.';
      }
      await applyDesign(p.design);
      if (detectedCutouts.A) switchTab('plate-a');

      delete p.design;
      delete p.board_url;
      np7.project = p;
      nameInput.value = p.name;
      var s = await takeSnap();
      np7.savedSnap = s.snap;
      np7.snap = s.snap;
      setUrl();
      done(problem || null, problem ? 'warn' : null);
    } catch (e) {
      done(e.message || 'Could not open the project.', 'err');
    }
  }

  async function newProject() {
    if (np7.busy) return;
    await check();
    if (isDirty() && !window.confirm('Your changes are not saved. Start an empty project anyway?')) return;
    closeList();
    clearBoard();
    np7.project = null;
    nameInput.value = '';
    switchTab('board');
    var s = await takeSnap();
    np7.snap = s.snap;
    np7.savedSnap = null;
    setUrl();
    done(null);
  }

  async function removeProject(p) {
    if (!window.confirm('Delete "' + p.name + '"?\n\nIt goes to the Archive and can be restored there.')) return;
    var r = await api('DELETE', API + '/' + p.id);
    if (!r.ok) { window.alert(r.json.error || 'Could not delete the project.'); return; }
    if (np7.project && np7.project.id === p.id) {
      np7.project = null;
      np7.savedSnap = null;
      setUrl();
      renderStatus();
    }
    np7.list = np7.list.filter(function (x) { return x.id !== p.id; });
    renderList();
  }

  // ---- the projects list ----------------------------------------------------
  var overlay = el('div', 'npp-overlay');
  overlay.id = 'np7-projects';
  var modal = el('div', 'npp-modal t-violet');
  var head = el('div', 'npp-mhead');
  var headTile = el('span', 'np-tile');
  headTile.innerHTML = ICON_FOLDER;
  var headText = el('div', 'min-w-0');
  headText.append(el('h2', '', 'Plate projects'), el('p', '', 'Board and plate, saved together'));
  var search = el('input', 'np-input npp-search');
  search.placeholder = 'Search';
  var closeBtn = el('button', 'npp-close', '×');
  closeBtn.title = 'Close';
  head.append(headTile, headText, search, closeBtn);
  var listEl = el('div', 'npp-list');
  var foot = el('div', 'npp-mfoot');
  var footNote = el('span', '', 'Board files are kept private. Deleted projects go to the Archive.');
  var newBtn2 = el('button', 'np-btn np-btn-soft np-btn-sm', '+ New project');
  foot.append(footNote, newBtn2);
  modal.append(head, listEl, foot);
  overlay.append(modal);
  document.body.append(overlay);

  function renderList() {
    listEl.innerHTML = '';
    var q = search.value.trim().toLowerCase();
    var rows = np7.list.filter(function (p) {
      return !q || (p.name + ' ' + (p.board_file_name || '')).toLowerCase().indexOf(q) >= 0;
    });
    if (!rows.length) {
      listEl.append(el('div', 'npp-empty',
        np7.list.length ? 'Nothing matches "' + search.value.trim() + '".' : 'No projects yet. Load a board, design the plate, press Save.'));
      return;
    }
    rows.forEach(function (p) {
      var current = np7.project && np7.project.id === p.id;
      var card = el('div', 'npp-card' + (current ? ' is-current' : ''));
      card.title = 'Open ' + p.name;
      var pic = el('div', 'npp-pic');
      if (p.thumb) {
        var img = el('img');
        img.src = p.thumb;
        img.alt = '';
        pic.append(img);
      } else {
        var t = el('span', 'np-tile');
        t.innerHTML = ICON_FOLDER;
        pic.append(t);
      }
      var text = el('div', 'npp-text');
      var kind = p.board_file_kind === 's3dx' ? 'Shape3D' : p.board_file_kind === 'stl' ? 'STL' : null;
      var meta = el('div', 'npp-meta');
      var chip = el('span', 'np-chip ' + (kind === 'Shape3D' ? 't-indigo' : kind ? 't-sky' : 't-slate'), kind || 'No board');
      meta.append(chip, el('span', '', kind ? (p.board_file_name || '') + (p.board_file_size ? ' · ' + mb(p.board_file_size) : '') : 'file'));
      text.append(
        el('div', 'npp-title', p.name),
        meta,
        el('div', 'npp-when', (current ? 'Open now · ' : '') + when(p.updated_at) + (p.updated_by ? ' · ' + p.updated_by : '')));
      var del = el('button', 'np-icon-btn npp-del', '✕');
      del.title = 'Delete (goes to the Archive)';
      del.addEventListener('click', function (e) { e.stopPropagation(); removeProject(p); });
      card.append(pic, text, del);
      card.addEventListener('click', function () {
        if (current && !isDirty()) { closeList(); return; }
        openProject(p.id);
      });
      listEl.append(card);
    });
  }

  async function showList() {
    overlay.classList.add('is-open');
    search.value = '';
    listEl.innerHTML = '';
    listEl.append(el('div', 'npp-empty', 'Loading…'));
    var r = await api('GET', API);
    if (!r.ok) {
      listEl.innerHTML = '';
      listEl.append(el('div', 'npp-empty npp-err', r.json.error || 'Could not load the projects.'));
      return;
    }
    np7.list = Array.isArray(r.json) ? r.json : [];
    renderList();
    search.focus();
  }
  function closeList() {
    overlay.classList.remove('is-open');
  }

  // ---- wiring ---------------------------------------------------------------
  openBtn.addEventListener('click', showList);
  saveBtn.addEventListener('click', function () { save(false); });
  copyBtn.addEventListener('click', function () { save(true); });
  newBtn.addEventListener('click', newProject);
  newBtn2.addEventListener('click', newProject);
  closeBtn.addEventListener('click', closeList);
  search.addEventListener('input', renderList);
  overlay.addEventListener('click', function (e) { if (e.target === overlay) closeList(); });
  nameInput.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); save(false); } });
  document.addEventListener('keydown', function (e) {
    if ((e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 's') { e.preventDefault(); save(false); }
    if (e.key === 'Escape' && overlay.classList.contains('is-open')) closeList();
  });
  window.addEventListener('beforeunload', function (e) {
    if (isDirty()) { e.preventDefault(); e.returnValue = ''; }
  });

  // The admin keeps its theme in localStorage (same origin), dark unless set.
  function applyTheme() {
    var dark = true;
    try { dark = localStorage.getItem('np7-admin-theme') !== 'light'; } catch { /* private mode */ }
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    scene.background = new THREE.Color(dark ? 0x111318 : 0xf1f5f9);
    scene.children.filter(function (o) { return o.type === 'GridHelper'; }).forEach(function (g) {
      scene.remove(g); g.geometry.dispose(); g.material.dispose();
    });
    var grid = new THREE.GridHelper(2000, 40, dark ? 0x3b4252 : 0x94a3b8, dark ? 0x23262e : 0xcbd5e1);
    scene.add(grid);
  }
  applyTheme();
  window.addEventListener('storage', function (e) { if (e.key === 'np7-admin-theme') applyTheme(); });
  if (window.parent !== window) document.documentElement.classList.add('np-embedded');

  (async function start() {
    var s = await takeSnap();
    np7.baseSnap = s.snap;
    np7.snap = s.snap;
    renderStatus();
    var want = new URLSearchParams(location.search).get('project');
    if (want) await openProject(want, true);
    else tellParent();
  })();
})();
