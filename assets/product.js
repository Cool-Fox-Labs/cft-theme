/**
 * Product page: colour, size grid with the bulk discount nudge, a design
 * card that opens one of two pop-ups (designer, or just send your files),
 * and one button that puts the sizes in the basket with the design attached
 * as line item properties. Reads its data from the JSON the
 * product-builder block writes.
 */
(() => {
  const root = document.getElementById('pdp');
  const dataEl = document.querySelector('[data-pdp-data]');
  if (!root || !dataEl) return;
  const D = JSON.parse(dataEl.textContent);
  const T = D.t;
  const q = (sel, el = document) => el.querySelector(sel);
  const qa = (sel, el = document) => [...el.querySelectorAll(sel)];
  const fill = (s, map) => Object.entries(map).reduce((out, [k, v]) => out.split('%' + k).join(v), s);
  const make = (tag, cls, text) => {
    const el = document.createElement(tag);
    if (cls) el.className = cls;
    if (text != null) el.textContent = text;
    return el;
  };

  // Default positions on a flat front shot. x and y are % of the photo; one
  // inch covers about 2.4% of the photo width. w is the widest print there.
  // The front is one area; "chest" is where a left chest logo sits in it.
  // A product can override these with its cft.print_positions metafield.
  const DEFAULT = {
    inch: 2.4,
    positions: [
      { id: 'fr', w: 11, x: 50, y: 30, view: 'front', chest: { w: 4, x: 62, y: 30 } },
      { id: 'fb', w: 12, x: 50, y: 27, view: 'back' },
      { id: 'ls', w: 3, x: 85, y: 33, view: 'front' },
      { id: 'rs', w: 3, x: 15, y: 33, view: 'front' },
    ],
  };
  const PRINT = D.print && D.print.positions ? D.print : DEFAULT;
  const INCH = PRINT.inch || DEFAULT.inch;
  const POS = PRINT.positions.map((p) => ({ ...p, name: p.name || T.pos[p.id] || p.id }));
  const posById = (id) => POS.find((p) => p.id === id);

  // Bulk discount tiers, by item count across the order.
  const TIERS = [[50, 20], [40, 15], [20, 10], [10, 5]];
  const rate = (n) => (TIERS.find(([min]) => n >= min) || [0, 0])[1];
  const nextTier = (n) => TIERS.map(([min]) => min).reverse().find((min) => min > n);

  const SIZES = D.sizes;
  const COLOURS = D.colours.map((c) => {
    const variants = D.variants.filter((v) => v.colour === c.name);
    const first = variants.find((v) => v.img) || {};
    return { ...c, variants, sizes: variants.map((v) => v.size), img: first.img, thumb: first.thumb };
  }).filter((c) => c.variants.length);
  const biggest = SIZES[SIZES.length - 1];
  const withBiggest = COLOURS.filter((c) => c.sizes.includes(biggest));
  const markBiggest = withBiggest.length > 0 && withBiggest.length < COLOURS.length;

  // design: null, { mode: 'designer', items: { posId: item } }
  // or { mode: 'files', files: [{ file, name, thumb, at: { posId: width|null } }], note }
  const st = {
    colour: COLOURS.find((c) => c.name === D.selectedColour) || COLOURS[0],
    qty: {},
    view: 'front',
    design: null,
  };

  const total = () => SIZES.reduce((n, s) => n + (st.colour.sizes.includes(s) ? st.qty[s] || 0 : 0), 0);
  const items = (n) => (n === 1 ? T.itemsOne : fill(T.itemsOther, { n }));
  const height = (w, item) => (w / item.ratio).toFixed(1);

  // A print size is 'best' (we choose), 'chest' (left chest logo) or a
  // width in inches. geo() is where and how big it shows on the photo.
  const sizeOf = (v) => (v === 'chest' || typeof v === 'number' ? v : 'best');
  function geo(p, size) {
    if (size === 'chest' && p.chest) return { ...p.chest };
    if (typeof size === 'number') return { x: p.x, y: p.y, w: size };
    return { x: p.x, y: p.y, w: p.w };
  }
  function tag(p, size) {
    if (size === 'chest') return `${T.chestTag} ${geo(p, size).w}in`;
    if (typeof size === 'number') return `${p.name} ${size}in`;
    return p.name;
  }
  function sizeText(p, size, item) {
    if (size === 'chest') return T.chestLogo;
    if (typeof size === 'number') return item && item.ratio ? fill(T.wxh, { w: size, h: height(size, item) }) : fill(T.inches, { w: size });
    return T.bestSize;
  }

  // Artwork check: compare the trimmed design's pixel width with the print width.
  function check(w, item) {
    if (!item || item.kind === 'text') return '';
    if (item.vector) return T.vector;
    const dpi = item.px / w;
    return dpi >= 200 ? T.good : dpi >= 120 ? T.ok : T.low;
  }

  /* ---------- stage: garment photo with designs placed ---------- */

  function drawStage(stage, view, placed, selected) {
    const c = st.colour;
    const shirt = q('[data-shirt]', stage);
    if (c.img) {
      shirt.removeAttribute('srcset');
      shirt.src = c.img;
    }
    shirt.alt = `${D.title}, ${c.name}, ${T.front}`;
    q('[data-back-note]', stage).hidden = view !== 'back';
    const box = q('[data-placements]', stage);
    box.innerHTML = '';
    POS.filter((p) => p.view === view && (placed[p.id] !== undefined || p.id === selected)).forEach((p) => {
      const item = placed[p.id];
      const size = sizeOf(item && item.size);
      const g = geo(p, size);
      const w = g.w * INCH;
      const el = make('div', 'ph' + (item && item.src ? '' : ' empty') + (p.id === selected ? ' sel' : ''));
      el.style.cssText = `left:${g.x - w / 2}%;top:${g.y}%;width:${w}%`;
      el.append(make('span', 'ph-tag', tag(p, size)));
      if (item && item.src) {
        const img = make('img');
        img.src = item.src;
        img.alt = '';
        el.append(img);
      }
      box.append(el);
    });
  }

  // What the page stage shows: designer items, or the files' thumbnails.
  function placedOnPage() {
    const d = st.design;
    if (!d) return {};
    if (d.mode === 'designer') return d.items;
    const out = {};
    d.files.forEach((f) => Object.keys(f.at).forEach((id) => { out[id] = out[id] || { src: f.thumb, size: f.at[id] }; }));
    return out;
  }

  /* ---------- page ---------- */

  function swatches() {
    const box = q('[data-swatches]');
    box.innerHTML = '';
    COLOURS.forEach((c) => {
      const b = make('button');
      b.type = 'button';
      b.title = c.name;
      b.setAttribute('aria-label', c.name);
      b.setAttribute('aria-pressed', String(c === st.colour));
      if (c.hex) b.style.setProperty('--c', c.hex);
      else if (c.thumb) b.style.backgroundImage = `url("${c.thumb}")`;
      if (markBiggest && c.sizes.includes(biggest)) b.classList.add('core');
      b.addEventListener('click', () => { st.colour = c; render(); });
      box.append(b);
    });
    const key = q('[data-sw-key]');
    key.hidden = !markBiggest;
    key.textContent = fill(T.upTo, { s: biggest });
  }

  function sizes() {
    const box = q('[data-sizes]');
    box.innerHTML = '';
    SIZES.forEach((s) => {
      const ok = st.colour.sizes.includes(s);
      const label = make('label', ok ? '' : 'na');
      const input = make('input');
      Object.assign(input, { type: 'number', inputMode: 'numeric', min: 0, placeholder: '0', disabled: !ok });
      if (ok && st.qty[s]) input.value = st.qty[s];
      input.addEventListener('input', () => { st.qty[s] = Math.max(0, parseInt(input.value, 10) || 0); totals(); });
      label.append(s, input);
      box.append(label);
    });
    q('[data-size-note]').textContent = st.colour.sizes.length < SIZES.length ? T.notMade : '';
  }

  function totals() {
    const n = total();
    const next = nextTier(n);
    q('[data-total]').textContent = items(n);
    q('[data-nudge-pct]').textContent = rate(n) + '%';
    q('[data-nudge-bar]').style.width = Math.min(100, n * 2) + '%';
    q('[data-nudge-text]').textContent = next ? fill(T.addMore, { n: next - n, p: rate(next) }) : T.top;
    const sum = `${items(n)} · ${st.colour.name}`;
    q('[data-sum]').textContent = sum;
    q('[data-mob-sum]').textContent = sum;
  }

  // One line per position: what goes there and how big.
  function describe() {
    const d = st.design;
    if (!d) return [];
    if (d.mode === 'designer') {
      return POS.filter((p) => d.items[p.id]).map((p) => {
        const item = d.items[p.id];
        const what = item.kind === 'text' ? `${T.text}: "${item.lines.join(' / ')}" (${item.font}, ${item.ink})` : item.name;
        return { name: p.name, text: `${what} · ${sizeText(p, sizeOf(item.size), item)}` };
      });
    }
    const out = [];
    POS.forEach((p) => {
      const parts = d.files.filter((f) => p.id in f.at).map((f) => `${f.name} · ${sizeText(p, sizeOf(f.at[p.id]))}`);
      if (parts.length) out.push({ name: p.name, text: parts.join('; ') });
    });
    return out;
  }

  function designCard() {
    const d = st.design;
    q('[data-design-empty]').hidden = !!d;
    q('[data-design-set]').hidden = !d;
    const list = q('[data-design-summary]');
    list.innerHTML = '';
    if (!d) return;
    const head = make('li', 'head', d.mode === 'designer' ? T.designedOnline : T.filesSent);
    list.append(head);
    describe().forEach((row) => {
      const li = make('li');
      li.append(make('b', '', row.name), make('span', '', row.text));
      list.append(li);
    });
    if (d.mode === 'files' && d.note) {
      const li = make('li');
      li.append(make('b', '', T.note), make('span', '', d.note));
      list.append(li);
    }
  }

  function render() {
    q('[data-colour-name]').textContent = st.colour.name;
    qa('[data-view]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.view === st.view)));
    swatches();
    sizes();
    designCard();
    drawStage(q('[data-stage="page"]'), st.view, placedOnPage(), null);
    totals();
  }

  qa('[data-view]').forEach((b) => b.addEventListener('click', () => { st.view = b.dataset.view; render(); }));

  /* ---------- reading uploads ---------- */

  // Trim transparent edges so the height comes from the drawn design, as in
  // the staff proof tool.
  function trim(img) {
    const cv = make('canvas');
    cv.width = img.naturalWidth;
    cv.height = img.naturalHeight;
    const cx = cv.getContext('2d');
    cx.drawImage(img, 0, 0);
    const whole = { src: img.src, ratio: img.naturalWidth / img.naturalHeight, px: img.naturalWidth };
    try {
      const px = cx.getImageData(0, 0, cv.width, cv.height).data;
      let x0 = cv.width, y0 = cv.height, x1 = -1, y1 = -1;
      for (let y = 0; y < cv.height; y++) {
        for (let x = 0; x < cv.width; x++) {
          if (px[(y * cv.width + x) * 4 + 3] > 8) {
            if (x < x0) x0 = x;
            if (x > x1) x1 = x;
            if (y < y0) y0 = y;
            if (y > y1) y1 = y;
          }
        }
      }
      if (x1 < 0) return whole;
      const out = make('canvas');
      out.width = x1 - x0 + 1;
      out.height = y1 - y0 + 1;
      out.getContext('2d').drawImage(cv, x0, y0, out.width, out.height, 0, 0, out.width, out.height);
      return { src: out.toDataURL('image/png'), ratio: out.width / out.height, px: out.width };
    } catch (e) {
      return whole;
    }
  }

  // Resolves to a trimmed image, or null when the browser can't show the
  // file (PDF, AI, EPS): those still go to the studio, just without a preview.
  const readImage = (file) => new Promise((resolve) => {
    if (!file.type.startsWith('image/')) { resolve(null); return; }
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => resolve(trim(img));
      img.onerror = () => resolve(null);
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });

  /* ---------- designer pop-up ---------- */

  const dz = q('[data-designer]');
  const dzs = { view: 'front', sel: null, items: {} };

  async function drawText(item) {
    const lines = item.lines.filter(Boolean);
    if (!lines.length) { item.src = null; return; }
    const family = getComputedStyle(document.documentElement).getPropertyValue('--' + item.fontVar).trim() || 'sans-serif';
    const font = `700 160px ${family}`;
    try { await document.fonts.load(font); } catch (e) { /* draw with whatever has loaded */ }
    const cv = make('canvas');
    const cx = cv.getContext('2d');
    cx.font = font;
    cv.width = Math.ceil(Math.max(...lines.map((l) => cx.measureText(l).width))) + 40;
    cv.height = lines.length * 190 + 40;
    cx.font = font;
    cx.fillStyle = item.inkHex;
    cx.textAlign = 'center';
    cx.textBaseline = 'top';
    lines.forEach((l, i) => cx.fillText(l, cv.width / 2, 20 + i * 190));
    const img = new Image();
    await new Promise((r) => { img.onload = r; img.src = cv.toDataURL('image/png'); });
    Object.assign(item, trim(img));
  }

  function fileButton(label, onFile) {
    const lab = make('label', 'pill pill-l', label);
    const input = make('input');
    input.type = 'file';
    input.accept = 'image/png,image/svg+xml,image/jpeg';
    input.addEventListener('change', async () => {
      const f = input.files[0];
      if (!f) return;
      const t = await readImage(f);
      if (t) onFile({ ...t, kind: 'upload', name: f.name, file: f, vector: f.type === 'image/svg+xml' });
    });
    lab.append(input);
    return lab;
  }

  // Best size for me / left chest logo / I need a specific size + width box.
  function sizePicker(p, value, onChange) {
    const row = make('div', 'fz-size');
    const sel = make('select');
    sel.setAttribute('aria-label', T.sizeLabel);
    const opts = [['best', T.bestSize]];
    if (p.chest) opts.push(['chest', T.chestLogo]);
    opts.push(['specific', T.specificSize]);
    const now = typeof value === 'number' ? 'specific' : sizeOf(value);
    opts.forEach(([v, t]) => {
      const o = make('option', '', t);
      o.value = v;
      o.selected = now === v;
      sel.append(o);
    });
    const w = Object.assign(make('input'), { type: 'number', min: 1, max: 14, step: 0.5, inputMode: 'decimal', value: typeof value === 'number' ? value : p.w });
    w.setAttribute('aria-label', T.widthIn);
    const wl = make('label', 'fz-w');
    wl.append(w, make('span', '', T.widthIn));
    wl.hidden = now !== 'specific';
    const send = () => {
      wl.hidden = sel.value !== 'specific';
      onChange(sel.value === 'specific' ? parseFloat(w.value) || p.w : sel.value === 'chest' ? 'chest' : 'best');
    };
    sel.addEventListener('change', send);
    w.addEventListener('input', send);
    row.append(sel, wl);
    return row;
  }

  function textForm(p, item) {
    const form = make('div', 'text-design');
    const field = (label, el) => { const l = make('label', '', label); l.append(el); form.append(l); return el; };
    const l1 = field(T.line1, Object.assign(make('input'), { type: 'text', maxLength: 30, value: item.lines[0] || '' }));
    const l2 = field(T.line2, Object.assign(make('input'), { type: 'text', maxLength: 30, value: item.lines[1] || '' }));
    const select = (opts, current) => {
      const s = make('select');
      opts.forEach(([v, t]) => { const o = make('option', '', t); o.value = v; o.selected = v === current; s.append(o); });
      return s;
    };
    const fontSel = field(T.font, select(T.fonts, item.fontVar));
    const inkSel = field(T.colour, select(T.inks, item.inkHex));
    const update = async () => {
      Object.assign(item, {
        lines: [l1.value.trim(), l2.value.trim()].filter(Boolean),
        fontVar: fontSel.value, font: fontSel.selectedOptions[0].text,
        inkHex: inkSel.value, ink: inkSel.selectedOptions[0].text,
      });
      await drawText(item);
      if (item.src) dzs.items[p.id] = item; else delete dzs.items[p.id];
      dzStage();
      dzPosButtons();
      dzInfo(p);
    };
    [l1, l2, fontSel, inkSel].forEach((el) => el.addEventListener('input', update));
    return form;
  }

  function dzInfo(p) {
    const info = q('[data-dz-info]', dz);
    if (!info) return;
    const item = dzs.items[p.id];
    info.innerHTML = '';
    if (!item) return;
    const size = sizeOf(item.size);
    info.append(make('b', '', sizeText(p, size, item)));
    const note = check(geo(p, size).w, item);
    if (note) info.append(make('span', note === T.low ? 'low' : '', note));
  }

  function dzPanel() {
    const panel = q('[data-dz-panel]', dz);
    panel.innerHTML = '';
    const p = posById(dzs.sel);
    if (!p) return;
    const item = dzs.items[p.id];
    panel.append(make('h3', '', `${p.name} · ${fill(T.inWide, { w: p.w })}`));
    const setItem = (it) => { it.size = item ? item.size : 'best'; dzs.items[p.id] = it; dzRender(); };
    if (!item) {
      panel.append(make('p', 'muted', T.emptyPos));
      const row = make('div', 'dz-choice');
      row.append(fileButton(T.addDesign, setItem));
      const textBtn = make('button', 'pill pill-l', T.addText);
      textBtn.type = 'button';
      textBtn.addEventListener('click', () => {
        const fresh = { kind: 'text', size: 'best', lines: [], fontVar: T.fonts[0][0], font: T.fonts[0][1], inkHex: T.inks[0][0], ink: T.inks[0][1] };
        q('p.muted', panel).remove();
        const info = make('div', 'dz-info');
        info.setAttribute('data-dz-info', '');
        panel.lastChild.replaceWith(info, sizePicker(p, fresh.size, (v) => { fresh.size = v; dzStage(); dzInfo(p); }), textForm(p, fresh));
      });
      row.append(textBtn);
      panel.append(row);
      return;
    }
    panel.append(make('div', 'dz-info'));
    panel.lastChild.setAttribute('data-dz-info', '');
    dzInfo(p);
    panel.append(sizePicker(p, item.size, (v) => { item.size = v; dzStage(); dzInfo(p); }));
    if (item.kind === 'text') panel.append(textForm(p, item));
    const row = make('div', 'dz-choice');
    if (item.kind === 'upload') row.append(fileButton(T.replace, setItem));
    const rm = make('button', 'text-btn', T.remove);
    rm.type = 'button';
    rm.addEventListener('click', () => { delete dzs.items[p.id]; dzRender(); });
    row.append(rm);
    panel.append(row);
  }

  function dzPosButtons() {
    const box = q('[data-dz-pos]', dz);
    box.innerHTML = '';
    POS.forEach((p) => {
      const b = make('button');
      b.type = 'button';
      b.setAttribute('aria-pressed', String(dzs.sel === p.id));
      if (dzs.items[p.id]) b.classList.add('filled');
      b.append(make('b', '', p.name), make('span', '', fill(T.inWide, { w: p.w })));
      b.addEventListener('click', () => { dzs.sel = p.id; dzs.view = p.view; dzRender(); });
      box.append(b);
    });
  }

  function dzStage() {
    qa('[data-dz-view]', dz).forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.dzView === dzs.view)));
    drawStage(q('[data-stage="designer"]', dz), dzs.view, dzs.items, dzs.sel);
  }

  function dzRender() {
    dzStage();
    dzPosButtons();
    dzPanel();
  }

  qa('[data-dz-view]', dz).forEach((b) => b.addEventListener('click', () => {
    dzs.view = b.dataset.dzView;
    if (posById(dzs.sel)?.view !== dzs.view) dzs.sel = null;
    dzRender();
  }));

  function openDesigner() {
    const d = st.design;
    dzs.items = d && d.mode === 'designer' ? { ...d.items } : {};
    dzs.view = st.view;
    dzs.sel = Object.keys(dzs.items)[0] || (POS.find((p) => p.view === dzs.view) || POS[0]).id;
    dzs.view = posById(dzs.sel).view;
    dzRender();
    dz.showModal();
  }
  q('[data-dz-close]', dz).addEventListener('click', () => dz.close());
  q('[data-dz-save]', dz).addEventListener('click', () => {
    st.design = Object.keys(dzs.items).length ? { mode: 'designer', items: { ...dzs.items } } : null;
    st.view = dzs.view;
    dz.close();
    render();
  });

  /* ---------- just send us your files pop-up ---------- */

  const fz = q('[data-files]');
  const fzs = { files: [] };

  function fzRender() {
    const list = q('[data-fz-list]', fz);
    list.innerHTML = '';
    fzs.files.forEach((f, i) => {
      const li = make('li');
      const top = make('div', 'fz-top');
      const thumb = make('span', 'thumb');
      if (f.thumb) thumb.style.backgroundImage = `url("${f.thumb}")`;
      const rm = make('button', 'text-btn', T.removeFile);
      rm.type = 'button';
      rm.addEventListener('click', () => { fzs.files.splice(i, 1); fzRender(); });
      top.append(thumb, make('b', '', f.name), rm);
      li.append(top);

      const chips = make('div', 'fz-pos');
      POS.forEach((p) => {
        const b = make('button', '', p.name);
        b.type = 'button';
        b.setAttribute('aria-pressed', String(p.id in f.at));
        b.addEventListener('click', () => {
          if (p.id in f.at) delete f.at[p.id]; else f.at[p.id] = null;
          q('[data-fz-msg]', fz).textContent = '';
          fzRender();
        });
        chips.append(b);
      });
      li.append(chips);

      POS.filter((p) => p.id in f.at).forEach((p) => {
        const row = make('div', 'fz-row');
        row.append(make('b', '', p.name), sizePicker(p, f.at[p.id], (v) => { f.at[p.id] = v === 'best' ? null : v; }));
        li.append(row);
      });
      list.append(li);
    });
  }

  q('[data-fz-input]', fz).addEventListener('change', async (e) => {
    for (const file of [...e.target.files]) {
      const t = await readImage(file);
      fzs.files.push({ file, name: file.name, thumb: t ? t.src : null, at: {} });
    }
    e.target.value = '';
    q('[data-fz-msg]', fz).textContent = '';
    fzRender();
  });

  function openFiles() {
    const d = st.design;
    fzs.files = d && d.mode === 'files' ? d.files.map((f) => ({ ...f, at: { ...f.at } })) : [];
    q('[data-fz-note]', fz).value = d && d.mode === 'files' ? d.note : '';
    q('[data-fz-msg]', fz).textContent = '';
    fzRender();
    fz.showModal();
  }
  q('[data-fz-close]', fz).addEventListener('click', () => fz.close());
  q('[data-fz-save]', fz).addEventListener('click', () => {
    if (fzs.files.some((f) => !Object.keys(f.at).length)) {
      q('[data-fz-msg]', fz).textContent = T.needPosition;
      return;
    }
    const note = q('[data-fz-note]', fz).value.trim();
    st.design = fzs.files.length ? { mode: 'files', files: fzs.files, note } : null;
    fz.close();
    render();
  });

  /* ---------- design card buttons ---------- */

  qa('[data-open]').forEach((b) => b.addEventListener('click', () => (b.dataset.open === 'designer' ? openDesigner() : openFiles())));
  q('[data-edit]').addEventListener('click', () => (st.design && st.design.mode === 'files' ? openFiles() : openDesigner()));
  q('[data-clear]').addEventListener('click', () => { st.design = null; render(); });

  /* ---------- add to the basket ---------- */

  const dataUrlToBlob = async (url) => (await fetch(url)).blob();

  // The artwork files, uploaded once with the first size of this garment.
  async function artworkFiles() {
    const d = st.design;
    if (!d) return [];
    if (d.mode === 'files') return d.files.map((f) => [f.file, f.name]);
    const out = [];
    for (const p of POS) {
      const item = d.items[p.id];
      if (!item) continue;
      if (item.kind === 'upload') out.push([item.file, item.name]);
      else out.push([await dataUrlToBlob(item.src), `${p.id}-text.png`]);
    }
    return out;
  }

  const msg = q('[data-add-msg]');
  async function addToBasket() {
    msg.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    const lines = SIZES.filter((s) => st.colour.sizes.includes(s) && st.qty[s]);
    if (!lines.length) { msg.textContent = T.needItems; return; }
    msg.textContent = T.adding;
    const group = Date.now().toString(36);
    const rows = describe();
    const files = await artworkFiles();
    try {
      for (let i = 0; i < lines.length; i++) {
        const v = st.colour.variants.find((x) => x.size === lines[i]);
        const body = new FormData();
        body.append('id', v.id);
        body.append('quantity', st.qty[lines[i]]);
        body.append('properties[_group]', group);
        if (!st.design) body.append(`properties[${T.printLabel}]`, T.noDesign);
        else body.append(`properties[${T.printLabel}]`, st.design.mode === 'designer' ? T.designedOnline : T.filesSent);
        rows.forEach((r) => body.append(`properties[${r.name}]`, r.text));
        if (st.design && st.design.mode === 'files' && st.design.note) body.append(`properties[${T.note}]`, st.design.note);
        if (i === 0) files.forEach(([blob, name], n) => body.append(`properties[${T.artwork} ${n + 1}]`, blob, name));
        const res = await fetch(D.cartAdd, { method: 'POST', body, headers: { Accept: 'application/json' } });
        if (!res.ok) throw new Error(String(res.status));
      }
      msg.innerHTML = fill(T.added, { u: D.cartUrl });
      document.dispatchEvent(new CustomEvent('cft:basket-changed'));
    } catch (e) {
      msg.textContent = T.addFail;
    }
  }
  qa('[data-add]').forEach((b) => b.addEventListener('click', addToBasket));

  /* ---------- size guide and positions table ---------- */

  const dlg = q('[data-size-dlg]');
  if (dlg) {
    q('[data-size-open]').addEventListener('click', () => dlg.showModal());
    q('[data-size-close]').addEventListener('click', () => dlg.close());
    dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });
  }

  POS.forEach((p) => {
    const tr = make('tr');
    tr.append(make('td', '', p.name), make('td', '', fill(T.inches, { w: p.w })));
    q('[data-pos-table]').append(tr);
  });

  render();
})();
