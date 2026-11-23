/* Studio — edits data/artworks.json and data/site.json.
   On the live site it saves through the GitHub API with a key the owner pastes in once.
   In the local preview (tools/serve.py) it saves straight to the folder. */
(function () {
  'use strict';

  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const TOKEN_KEY = 'studio-token';

  const I = {
    up: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 19V5M6 11l6-6 6 6"/></svg>',
    down: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 5v14M6 13l6 6 6-6"/></svg>',
    edit: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16v4z"/><path d="M14 6l4 4"/></svg>',
    x: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>',
    star: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" aria-hidden="true"><path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"/></svg>',
    img: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="3"/><circle cx="9" cy="10" r="2"/><path d="M21 16l-5-5-9 9"/></svg>'
  };

  const state = {
    local: false,
    token: '',
    repo: { owner: '', repo: '', branch: 'main' },
    site: {},
    works: [],
    editing: null
  };

  /* ------------------------------------------------------------ status */
  let statusTimer;
  function status(text, kind) {
    const el = $('#status');
    el.textContent = text;
    el.className = 'st-status show' + (kind ? ' ' + kind : '');
    document.body.classList.toggle('is-busy', kind === 'busy');
    clearTimeout(statusTimer);
    if (kind !== 'busy') statusTimer = setTimeout(() => el.classList.remove('show'), kind === 'error' ? 7000 : 4200);
  }
  const savedMsg = () => state.local ? 'Saved. Refresh the site to see it.' : 'Saved. Your live site updates in about a minute.';

  /* --------------------------------------------------------------- api */
  const base = () => (state.local ? '/__local/api' : 'https://api.github.com');
  const repoPath = () => `/repos/${encodeURIComponent(state.repo.owner)}/${encodeURIComponent(state.repo.repo)}`;
  const encPath = (p) => p.split('/').map(encodeURIComponent).join('/');

  async function api(method, path, body) {
    const headers = { Accept: 'application/vnd.github+json' };
    if (!state.local) {
      headers.Authorization = 'Bearer ' + state.token;
      headers['X-GitHub-Api-Version'] = '2022-11-28';
    }
    if (body) headers['Content-Type'] = 'application/json';
    const r = await fetch(base() + path, { method, headers, body: body ? JSON.stringify(body) : undefined, cache: 'no-store' });
    const data = await r.json().catch(() => null);
    if (!r.ok) {
      const e = new Error((data && data.message) || 'GitHub replied ' + r.status);
      e.status = r.status;
      throw e;
    }
    return data;
  }

  function b64ToText(b64) {
    const bin = atob(String(b64 || '').replace(/\s/g, ''));
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  }
  function textToB64(text) {
    const bytes = new TextEncoder().encode(text);
    let bin = '';
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(bin);
  }

  async function getFile(path) {
    const d = await api('GET', `${repoPath()}/contents/${encPath(path)}?ref=${encodeURIComponent(state.repo.branch)}`);
    return { sha: d.sha, text: d.content ? b64ToText(d.content) : '' };
  }
  async function putFile(path, b64, message, sha) {
    const body = { message, content: b64, branch: state.repo.branch };
    if (sha) body.sha = sha;
    return api('PUT', `${repoPath()}/contents/${encPath(path)}`, body);
  }
  async function deleteFile(path, message) {
    try {
      const d = await api('GET', `${repoPath()}/contents/${encPath(path)}?ref=${encodeURIComponent(state.repo.branch)}`);
      await api('DELETE', `${repoPath()}/contents/${encPath(path)}`, { message, sha: d.sha, branch: state.repo.branch });
    } catch (e) {
      if (e.status !== 404) console.warn('Could not delete', path, e);
    }
  }

  /** Read a JSON file fresh, change it, write it back. Retries once if it changed meanwhile. */
  async function updateJson(path, change, message, tries = 2) {
    const f = await getFile(path);
    const data = JSON.parse(f.text);
    const next = change(data) || data;
    try {
      await putFile(path, textToB64(JSON.stringify(next, null, 2) + '\n'), message, f.sha);
      return next;
    } catch (e) {
      if ((e.status === 409 || e.status === 422) && tries > 1) return updateJson(path, change, message, tries - 1);
      throw e;
    }
  }

  /* -------------------------------------------------------------- boot */
  async function boot() {
    try {
      const r = await fetch('../data/site.json?v=' + Date.now(), { cache: 'no-store' });
      state.site = await r.json();
    } catch (e) { state.site = {}; }
    Object.assign(state.repo, state.site.github || {});
    $('#repoName').textContent = state.repo.repo || 'your website repo';

    try {
      const r = await fetch('/__local/api/ping', { cache: 'no-store' });
      state.local = r.ok && (await r.json()).ok === true;
    } catch (e) { state.local = false; }

    if (!state.local) {
      try { state.token = localStorage.getItem(TOKEN_KEY) || ''; } catch (e) { state.token = ''; }
      if (!state.token) return showConnect();
      try { await verify(); } catch (e) { return showConnect(e.message); }
    }
    await start();
  }

  async function verify() {
    if (!state.repo.owner || !state.repo.repo) throw new Error('The site settings are missing the GitHub repo name.');
    let repo;
    try { repo = await api('GET', repoPath()); } catch (e) {
      if (e.status === 401) throw new Error('GitHub didn\'t accept that key. It may have expired. Make a new one and paste it in.');
      if (e.status === 404) throw new Error(`That key can't see ${state.repo.owner}/${state.repo.repo}. Check you picked that repository when making the key.`);
      throw e;
    }
    if (repo.permissions && !repo.permissions.push) throw new Error('That key can only read. Set "Contents" to "Read and write" and try again.');
    if (!state.site.github || !state.site.github.branch) state.repo.branch = repo.default_branch || 'main';
  }

  function showConnect(err) {
    $('#loading').hidden = true;
    $('#app').hidden = true;
    $('#connect').hidden = false;
    const box = $('#connectError');
    box.hidden = !err;
    box.textContent = err || '';
  }

  $('#connectForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    state.token = $('#token').value.trim();
    if (!state.token) return;
    status('Checking the key…', 'busy');
    try {
      await verify();
      try { localStorage.setItem(TOKEN_KEY, state.token); } catch (err) { /* private mode: works for this visit */ }
      $('#token').value = '';
      status('Connected.');
      await start();
    } catch (err) {
      status('Couldn\'t connect', 'error');
      showConnect(err.message);
    }
  });

  $('#signout').addEventListener('click', () => {
    try { localStorage.removeItem(TOKEN_KEY); } catch (e) { /* ignore */ }
    state.token = '';
    $('#conn').hidden = true;
    showConnect();
  });

  async function start() {
    status('Loading your work…', 'busy');
    try {
      const [s, a] = await Promise.all([getFile('data/site.json'), getFile('data/artworks.json')]);
      state.site = JSON.parse(s.text);
      state.works = JSON.parse(a.text).artworks || [];
    } catch (e) {
      status('Couldn\'t load: ' + e.message, 'error');
      return;
    }
    $('#loading').hidden = true;
    $('#connect').hidden = true;
    $('#app').hidden = false;
    const conn = $('#conn');
    conn.textContent = state.local ? 'Local preview: saves to this computer' : `Connected to ${state.repo.owner}/${state.repo.repo}`;
    conn.hidden = false;
    $('#signoutWrap').hidden = state.local;
    renderList();
    fillSettings();
    $('#status').classList.remove('show');
    document.body.classList.remove('is-busy');
  }

  /* -------------------------------------------------------------- tabs */
  $$('.st-tab').forEach((t) => t.addEventListener('click', () => {
    $$('.st-tab').forEach((x) => x.setAttribute('aria-selected', x === t));
    $('#pane-art').hidden = t.dataset.tab !== 'art';
    $('#pane-settings').hidden = t.dataset.tab !== 'settings';
  }));

  /* -------------------------------------------------------------- list */
  const money = (n) => '$' + (Number(n) % 1 ? Number(n).toFixed(2) : Number(n));
  const assetUrl = (p) => (/^(https?:)?\/\//.test(p) ? p : '../' + p);

  function summary(a) {
    const opts = a.options || [];
    if (!opts.length) return ['Not for sale'];
    return opts.map((o) => `${o.label || o.kind} ${money(o.price)}${o.sold ? ' (sold)' : ''}`);
  }

  function renderList() {
    const list = $('#artList');
    const n = state.works.length;
    $('#artCount').textContent = n ? `${n} piece${n === 1 ? '' : 's'} on your site. The order here is the order on the site.` : 'Nothing on your site yet.';
    $('#samples').hidden = !state.works.some((a) => a.sample);
    if (!n) {
      list.innerHTML = '<li class="empty-list">Add your first piece with the <b>Add artwork</b> button.</li>';
      return;
    }
    list.innerHTML = state.works.map((a, i) => {
      const img = a.images && a.images[0];
      const allSold = (a.options || []).length && (a.options || []).every((o) => o.sold);
      return `<li class="row" data-id="${esc(a.id)}">
        <img class="row-thumb" src="${img ? esc(assetUrl(img.thumb || img.src)) : ''}" alt="" loading="lazy">
        <div class="row-main">
          <strong>${esc(a.title)}</strong>
          <div class="row-meta">
            ${allSold ? '<span class="badge sold">Sold</span>' : ''}
            ${a.featured ? '<span class="badge star">Front wall</span>' : ''}
            ${a.sample ? '<span class="badge">Sample</span>' : ''}
            <span>${esc(summary(a).join(' · '))}</span>
          </div>
        </div>
        <div class="row-actions">
          <button class="icon-btn" type="button" data-move="-1" aria-label="Move up" ${i === 0 ? 'disabled' : ''}>${I.up}</button>
          <button class="icon-btn" type="button" data-move="1" aria-label="Move down" ${i === n - 1 ? 'disabled' : ''}>${I.down}</button>
          <button class="btn sm ghost" type="button" data-edit>${I.edit}Edit</button>
        </div>
      </li>`;
    }).join('');
  }

  $('#artList').addEventListener('click', async (e) => {
    const row = e.target.closest('.row');
    if (!row) return;
    const id = row.dataset.id;
    if (e.target.closest('[data-edit]')) return openEditor(state.works.find((a) => a.id === id));
    const mv = e.target.closest('[data-move]');
    if (mv) {
      const dir = Number(mv.dataset.move);
      status('Moving…', 'busy');
      try {
        const next = await updateJson('data/artworks.json', (d) => {
          const i = d.artworks.findIndex((a) => a.id === id);
          const j = i + dir;
          if (i < 0 || j < 0 || j >= d.artworks.length) return d;
          [d.artworks[i], d.artworks[j]] = [d.artworks[j], d.artworks[i]];
          return d;
        }, 'Reorder artwork');
        state.works = next.artworks;
        renderList();
        status(savedMsg());
      } catch (err) { status('Couldn\'t move it: ' + err.message, 'error'); }
    }
  });

  $('#removeSamples').addEventListener('click', async () => {
    if (!confirm('Remove all the sample pieces from your site? Your own artwork stays.')) return;
    status('Removing samples…', 'busy');
    try {
      const next = await updateJson('data/artworks.json', (d) => { d.artworks = d.artworks.filter((a) => !a.sample); return d; }, 'Remove sample artwork');
      state.works = next.artworks;
      renderList();
      status(savedMsg());
    } catch (err) { status('Couldn\'t remove them: ' + err.message, 'error'); }
  });

  /* ------------------------------------------------------------ images */
  function loadImage(file) {
    return new Promise((ok, fail) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => { ok(img); setTimeout(() => URL.revokeObjectURL(url), 1000); };
      img.onerror = () => { URL.revokeObjectURL(url); fail(new Error(`"${file.name}" couldn't be opened. Try a JPG or PNG.`)); };
      img.src = url;
    });
  }
  function render(img, max, quality) {
    const s = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.round(img.naturalWidth * s), h = Math.round(img.naturalHeight * s);
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, w, h);
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, w, h);
    return { b64: c.toDataURL('image/jpeg', quality).split(',')[1], w, h };
  }
  function averageColor(img) {
    const c = document.createElement('canvas');
    c.width = c.height = 12;
    const ctx = c.getContext('2d');
    ctx.drawImage(img, 0, 0, 12, 12);
    const d = ctx.getImageData(0, 0, 12, 12).data;
    let r = 0, g = 0, b = 0;
    for (let i = 0; i < d.length; i += 4) { r += d[i]; g += d[i + 1]; b += d[i + 2]; }
    const n = d.length / 4;
    return '#' + [r, g, b].map((v) => Math.round(v / n).toString(16).padStart(2, '0')).join('');
  }
  async function uploadImage(file, folder, stem, label) {
    const img = await loadImage(file);
    const full = render(img, 2200, 0.86);
    const thumb = render(img, 900, 0.82);
    const src = `${folder}/${stem}.jpg`, th = `${folder}/${stem}-sm.jpg`;
    await putFile(src, full.b64, `Add photo: ${label}`);
    await putFile(th, thumb.b64, `Add thumbnail: ${label}`);
    return { image: { src, thumb: th, w: full.w, h: full.h }, color: averageColor(img) };
  }

  /* ------------------------------------------------------------ editor */
  const dlg = $('#editor');
  const form = $('#artForm');

  function openEditor(a) {
    const orig = a || null;
    state.editing = {
      orig,
      photos: (orig ? orig.images : []).map((im) => ({ data: im, preview: assetUrl(im.thumb || im.src) })),
      options: orig ? JSON.parse(JSON.stringify(orig.options || [])) : [{ kind: 'original', label: 'Original', price: '', sold: false }]
    };
    form.reset();
    $('#editorTitle').textContent = orig ? 'Edit artwork' : 'New artwork';
    form.title.value = orig ? orig.title || '' : '';
    form.medium.value = orig ? orig.medium || '' : '';
    form.size.value = orig ? orig.size || '' : '';
    form.year.value = orig ? orig.year || '' : String(new Date().getFullYear());
    form.description.value = orig ? orig.description || '' : '';
    form.featured.checked = !!(orig && orig.featured);
    form.instagram.value = orig ? orig.instagram || '' : '';
    $('#deleteArt').hidden = !orig;
    $('#artError').hidden = true;
    renderPhotos();
    renderOptions();
    dlg.showModal();
    $('.sheet-body', dlg).scrollTop = 0;
  }

  function closeEditor() {
    (state.editing ? state.editing.photos : []).forEach((p) => { if (p.file) URL.revokeObjectURL(p.preview); });
    state.editing = null;
    dlg.close();
  }
  $$('[data-close]', dlg).forEach((b) => b.addEventListener('click', closeEditor));
  dlg.addEventListener('cancel', (e) => { e.preventDefault(); closeEditor(); });

  function renderPhotos() {
    const ed = state.editing;
    $('#photos').innerHTML = ed.photos.map((p, i) => `
      <div class="ph">
        <img src="${esc(p.preview)}" alt="">
        ${i === 0 ? '<span class="ph-cover">Main</span>' : ''}
        <div class="ph-tools">
          ${i > 0 ? `<button type="button" data-cover="${i}" aria-label="Make this the main photo">${I.star}</button>` : ''}
          <button type="button" data-remove-photo="${i}" aria-label="Remove photo">${I.x}</button>
        </div>
      </div>`).join('') +
      `<label class="drop" id="drop">${I.img}<span>${ed.photos.length ? 'Add more' : 'Add photos'}</span><input type="file" accept="image/*" multiple id="photoInput"></label>`;
    $('#photoInput').addEventListener('change', (e) => addFiles(e.target.files));
    const drop = $('#drop');
    drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('is-over'); });
    drop.addEventListener('dragleave', () => drop.classList.remove('is-over'));
    drop.addEventListener('drop', (e) => { e.preventDefault(); drop.classList.remove('is-over'); addFiles(e.dataTransfer.files); });
  }
  function addFiles(files) {
    [...(files || [])].filter((f) => /^image\//.test(f.type) || /\.(heic|heif)$/i.test(f.name)).forEach((file) => {
      state.editing.photos.push({ file, preview: URL.createObjectURL(file) });
    });
    renderPhotos();
  }
  $('#photos').addEventListener('click', (e) => {
    const ed = state.editing;
    const c = e.target.closest('[data-cover]');
    const r = e.target.closest('[data-remove-photo]');
    if (c) { const [p] = ed.photos.splice(Number(c.dataset.cover), 1); ed.photos.unshift(p); renderPhotos(); }
    if (r) { const [p] = ed.photos.splice(Number(r.dataset.removePhoto), 1); if (p.file) URL.revokeObjectURL(p.preview); renderPhotos(); }
  });

  function readOptions() {
    $$('.opt-row', form).forEach((row, i) => {
      const o = state.editing.options[i];
      o.kind = $('[data-k="kind"]', row).value;
      o.label = $('[data-k="label"]', row).value.trim();
      o.price = $('[data-k="price"]', row).value === '' ? '' : Number($('[data-k="price"]', row).value);
      o.sold = $('[data-k="sold"]', row).checked;
    });
  }
  function renderOptions() {
    const box = $('#optsEdit');
    const opts = state.editing.options;
    if (!opts.length) { box.innerHTML = '<p class="opts-empty">Not for sale. Add an original or a print size to sell it.</p>'; return; }
    box.innerHTML = opts.map((o, i) => `
      <div class="opt-row">
        <select data-k="kind" aria-label="Type">
          <option value="original"${o.kind === 'original' ? ' selected' : ''}>Original</option>
          <option value="print"${o.kind === 'print' ? ' selected' : ''}>Print</option>
        </select>
        <input class="opt-label" data-k="label" value="${esc(o.label)}" placeholder="${o.kind === 'print' ? 'e.g. 8 × 10 in print' : 'Original painting'}" aria-label="Name shown to buyers">
        <span class="price"><input data-k="price" type="number" min="0" step="1" inputmode="decimal" value="${esc(o.price)}" placeholder="Price" aria-label="Price"></span>
        <label class="sold-tog"><input data-k="sold" type="checkbox"${o.sold ? ' checked' : ''}>Sold</label>
        <button class="icon-btn" type="button" data-remove-opt="${i}" aria-label="Remove this option">${I.x}</button>
      </div>`).join('');
  }
  $('#optsEdit').addEventListener('click', (e) => {
    const r = e.target.closest('[data-remove-opt]');
    if (!r) return;
    readOptions();
    state.editing.options.splice(Number(r.dataset.removeOpt), 1);
    renderOptions();
  });
  $$('[data-add-opt]', form).forEach((b) => b.addEventListener('click', () => {
    readOptions();
    const kind = b.dataset.addOpt;
    state.editing.options.push({ kind, label: kind === 'original' ? 'Original' : '', price: '', sold: false });
    renderOptions();
    const rows = $$('.opt-row', form);
    const last = rows[rows.length - 1];
    $(kind === 'print' ? '[data-k="label"]' : '[data-k="price"]', last).focus();
  }));

  function slugify(s) {
    return String(s).toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48) || 'artwork';
  }
  function uniqueId(title) {
    const base = slugify(title);
    let id = base, n = 2;
    while (state.works.some((a) => a.id === id)) id = `${base}-${n++}`;
    return id;
  }
  function artError(msg) {
    const box = $('#artError');
    box.textContent = msg;
    box.hidden = false;
    box.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const ed = state.editing;
    if (!ed) return;
    readOptions();
    $('#artError').hidden = true;
    const title = form.title.value.trim();
    if (!title) { form.title.focus(); return artError('Give it a title.'); }
    if (!ed.photos.length) return artError('Add at least one photo.');
    const bad = ed.options.find((o) => o.price === '' || isNaN(o.price) || o.price < 0);
    if (bad) return artError('Every option needs a price. Remove the ones you don\'t need.');
    ed.options.forEach((o) => { if (!o.label) o.label = o.kind === 'original' ? 'Original' : 'Print'; });

    const orig = ed.orig;
    const id = orig ? orig.id : uniqueId(title);
    const stamp = Date.now().toString(36);
    let color = orig ? orig.color : '';
    const images = [];
    try {
      let k = 0;
      const newCount = ed.photos.filter((p) => p.file).length;
      for (const p of ed.photos) {
        if (!p.file) { images.push(p.data); continue; }
        k++;
        status(newCount > 1 ? `Uploading photo ${k} of ${newCount}…` : 'Uploading photo…', 'busy');
        const up = await uploadImage(p.file, `art/${id}`, `${stamp}-${k}`, title);
        images.push(up.image);
        if (images.length === 1) color = up.color;
      }

      status('Saving…', 'busy');
      const record = Object.assign({}, orig || {}, {
        id,
        title,
        year: form.year.value.trim(),
        medium: form.medium.value.trim(),
        size: form.size.value.trim(),
        description: form.description.value.trim(),
        images,
        color: color || '#EEE7DA',
        options: ed.options.map((o) => ({ kind: o.kind, label: o.label, price: Number(o.price), sold: !!o.sold })),
        featured: form.featured.checked,
        instagram: form.instagram.value.trim(),
        added: orig ? orig.added : new Date().toISOString().slice(0, 10)
      });
      if (!orig || !orig.sample) delete record.sample;
      if (orig && orig.sample && images.some((im) => !/^art\/samples\//.test(im.src))) delete record.sample;

      const next = await updateJson('data/artworks.json', (d) => {
        const i = d.artworks.findIndex((a) => a.id === id);
        if (i >= 0) d.artworks[i] = record; else d.artworks.unshift(record);
        return d;
      }, `${orig ? 'Update' : 'Add'} artwork: ${title}`);
      state.works = next.artworks;

      if (orig) {
        const kept = new Set(images.flatMap((im) => [im.src, im.thumb]));
        const gone = orig.images.flatMap((im) => [im.src, im.thumb]).filter((p) => p && !kept.has(p) && /^art\//.test(p) && !/^art\/samples\//.test(p));
        for (const p of [...new Set(gone)]) await deleteFile(p, `Remove photo: ${title}`);
      }
      closeEditor();
      renderList();
      status(savedMsg());
    } catch (err) {
      status('Couldn\'t save', 'error');
      artError('Something went wrong: ' + err.message + ' Nothing is lost, so try Save again.');
    }
  });

  $('#deleteArt').addEventListener('click', async () => {
    const orig = state.editing && state.editing.orig;
    if (!orig) return;
    if (!confirm(`Delete "${orig.title}" from your site? This can't be undone.`)) return;
    status('Deleting…', 'busy');
    try {
      const next = await updateJson('data/artworks.json', (d) => { d.artworks = d.artworks.filter((a) => a.id !== orig.id); return d; }, `Delete artwork: ${orig.title}`);
      state.works = next.artworks;
      const files = orig.images.flatMap((im) => [im.src, im.thumb]).filter((p) => p && /^art\//.test(p) && !/^art\/samples\//.test(p));
      for (const p of [...new Set(files)]) await deleteFile(p, `Remove photo: ${orig.title}`);
      closeEditor();
      renderList();
      status(savedMsg());
    } catch (err) { status('Couldn\'t delete it: ' + err.message, 'error'); }
  });

  /* ---------------------------------------------------------- settings */
  let aboutPhotoFile = null;
  let aboutPhotoRemoved = false;

  function fillSettings() {
    const s = state.site;
    const f = $('#settingsForm');
    ['instagram', 'email', 'etransferEmail', 'currency', 'shippingNote', 'name', 'tagline', 'intro', 'location'].forEach((k) => { f[k].value = s[k] || ''; });
    f.ticker.value = (s.ticker || []).join('\n');
    f.aboutHeading.value = (s.about && s.about.heading) || '';
    f.aboutText.value = (s.about && s.about.text) || '';
    aboutPhotoFile = null;
    aboutPhotoRemoved = false;
    renderAboutPhoto();
  }
  function renderAboutPhoto() {
    const cur = state.site.about && state.site.about.photo;
    const src = aboutPhotoFile ? aboutPhotoFile.preview : (!aboutPhotoRemoved && cur ? assetUrl(cur) : '');
    $('#aboutPhotoEdit').innerHTML = (src ? `<div class="ph"><img src="${esc(src)}" alt=""><div class="ph-tools"><button type="button" data-about-remove aria-label="Remove photo">${I.x}</button></div></div>` : '') +
      `<label class="drop">${I.img}<span>${src ? 'Replace' : 'Add photo'}</span><input type="file" accept="image/*" id="aboutInput"></label>`;
    $('#aboutInput').addEventListener('change', (e) => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      if (aboutPhotoFile) URL.revokeObjectURL(aboutPhotoFile.preview);
      aboutPhotoFile = { file, preview: URL.createObjectURL(file) };
      renderAboutPhoto();
    });
  }
  $('#aboutPhotoEdit').addEventListener('click', (e) => {
    if (!e.target.closest('[data-about-remove]')) return;
    if (aboutPhotoFile) { URL.revokeObjectURL(aboutPhotoFile.preview); aboutPhotoFile = null; } else aboutPhotoRemoved = true;
    renderAboutPhoto();
  });

  function metaBlock(s) {
    const t = (v) => esc(v).replace(/'/g, '&#39;');
    const title = `${s.name || 'Studio'} — original art & prints`;
    const desc = s.intro || '';
    return `<!-- meta:start -->
  <title>${t(title)}</title>
  <meta name="description" content="${t(desc)}">
  <meta property="og:title" content="${t(title)}">
  <meta property="og:description" content="${t(desc)}">
  <!-- meta:end -->`;
  }

  $('#settingsForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target;
    const handle = f.instagram.value.trim().replace(/^https?:\/\/(www\.)?instagram\.com\//i, '').replace(/^@/, '').replace(/[/?#].*$/, '');
    const values = {
      name: f.name.value.trim() || 'Studio',
      tagline: f.tagline.value.trim(),
      intro: f.intro.value.trim(),
      instagram: handle,
      email: f.email.value.trim(),
      etransferEmail: f.etransferEmail.value.trim(),
      currency: (f.currency.value.trim() || 'CAD').toUpperCase(),
      location: f.location.value.trim(),
      shippingNote: f.shippingNote.value.trim(),
      ticker: f.ticker.value.split('\n').map((x) => x.trim()).filter(Boolean)
    };
    try {
      let photo = state.site.about && state.site.about.photo || '';
      const oldPhoto = photo;
      if (aboutPhotoFile) {
        status('Uploading photo…', 'busy');
        photo = (await uploadImage(aboutPhotoFile.file, 'art/about', 'about-' + Date.now().toString(36), 'about photo')).image.src;
      } else if (aboutPhotoRemoved) photo = '';

      status('Saving…', 'busy');
      const next = await updateJson('data/site.json', (d) => {
        Object.assign(d, values);
        d.about = Object.assign({}, d.about, { heading: f.aboutHeading.value.trim(), text: f.aboutText.value.trim(), photo });
        return d;
      }, 'Update site details');
      state.site = next;

      if (oldPhoto && oldPhoto !== photo && /^art\/about\//.test(oldPhoto)) {
        await deleteFile(oldPhoto, 'Remove old about photo');
        await deleteFile(oldPhoto.replace(/\.jpg$/, '-sm.jpg'), 'Remove old about photo');
      }

      // keep the page title and link previews (iMessage, Facebook…) in step with the name and intro
      try {
        const idx = await getFile('index.html');
        const html = idx.text.replace(/<!-- meta:start -->[\s\S]*?<!-- meta:end -->/, metaBlock(next));
        if (html !== idx.text) await putFile('index.html', textToB64(html), 'Update page title and description', idx.sha);
      } catch (err) { console.warn('Could not update page title', err); }

      if (aboutPhotoFile) URL.revokeObjectURL(aboutPhotoFile.preview);
      fillSettings();
      status(savedMsg());
    } catch (err) { status('Couldn\'t save: ' + err.message, 'error'); }
  });

  $('#addArt').addEventListener('click', () => openEditor(null));

  boot().catch((e) => {
    $('#loading').textContent = 'The Studio couldn\'t open: ' + e.message;
  });
})();
