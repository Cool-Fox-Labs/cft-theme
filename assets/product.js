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

  // design: null, { mode: 'designer', items: { posId: item } }
  // or { mode: 'files', files: [{ file, name, thumb, at: { posId: width|null } }], note }
  const st = {
    colour: COLOURS.find((c) => c.name === D.selectedColour) || COLOURS[0],
    qty: {},
    view: 'front',
    photo: null,
    design: null,
  };

  const total = () => SIZES.reduce((n, s) => n + (st.colour.sizes.includes(s) ? st.qty[s] || 0 : 0), 0);
  const items = (n) => (n === 1 ? T.itemsOne : fill(T.itemsOther, { n }));
  const height = (w, item) => (w / item.ratio).toFixed(1);

  // A print size is 'best' (we choose), 'chest' (left chest logo) or a
  // width in inches.
  const sizeOf = (v) => (v === 'chest' || typeof v === 'number' ? v : 'best');
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

  // Views come from the product. Front is always there and uses the colour's
  // own photo. Back and sleeves appear only when the product's
  // cft.print_positions metafield lists them under "views", each with its
  // print area and a photo per colour:
  //   {"inch": 2.4, "views": [{"id": "back", "area": {"w": 12, "h": 14, "x": 50, "y": 22},
  //     "images": {"Black": "https://…", "default": "https://…"}}]}
  // x is the centre and y the top of the area, as % of the photo; w and h are inches.
  const ASPECT = 5 / 6; // stage width / height
  const pw = (inches) => inches * INCH; // inches to % of photo width
  const ph = (inches) => inches * INCH * ASPECT; // inches to % of photo height
  const half = (n) => Math.round(n * 2) / 2;
  const BASE_AREA = {
    front: { w: 12, h: 14, x: 50, y: 25 },
    back: { w: 12, h: 14, x: 50, y: 22 },
    ls: { w: 4, h: 4, x: 50, y: 35 },
    rs: { w: 4, h: 4, x: 50, y: 35 },
  };
  const DEFAULT_NAME = { front: T.pos.fr, back: T.pos.fb, ls: T.pos.ls, rs: T.pos.rs };
  const listed = D.print && Array.isArray(D.print.views) ? D.print.views.filter((v) => v && v.id) : [];
  const VIEW_LIST = ['front', ...listed.map((v) => v.id).filter((id) => id !== 'front')].map((id) => {
    const v = listed.find((x) => x.id === id) || {};
    return { id, name: v.name || DEFAULT_NAME[id] || id, area: { ...(BASE_AREA[id] || BASE_AREA.front), ...(v.area || {}) }, images: v.images || null };
  });
  const VIEWS = VIEW_LIST.map((v) => v.id);
  const AREAS = Object.fromEntries(VIEW_LIST.map((v) => [v.id, v.area]));
  const VIEW_NAME = Object.fromEntries(VIEW_LIST.map((v) => [v.id, v.name]));
  // The view's own photo for the chosen colour, or null to use the front photo.
  function photoFor(id) {
    const v = VIEW_LIST.find((x) => x.id === id);
    if (id === 'front' || !v || !v.images) return null;
    return v.images[st.colour.name] || v.images.default || null;
  }

  // A placed design: x and y are its centre as % of the photo, w its width in inches.
  function box(it) {
    const w = pw(it.w);
    const h = ph(it.w / it.ratio);
    return { left: it.x - w / 2, top: it.y - h / 2, w, h };
  }
  // Keep a design inside its print area.
  function fit(it) {
    const a = AREAS[it.view];
    it.w = Math.max(1, Math.min(it.w, a.w, a.h * it.ratio));
    const b = box(it);
    const left = a.x - pw(a.w) / 2;
    const right = a.x + pw(a.w) / 2;
    it.x = Math.min(Math.max(it.x, left + b.w / 2), right - b.w / 2);
    it.y = Math.min(Math.max(it.y, a.y + b.h / 2), a.y + ph(a.h) - b.h / 2);
  }
  const sizeLabel = (it) => fill(T.wxh, { w: half(it.w), h: half(it.w / it.ratio) });
  const dragSize = (it) => `${half(it.w)} × ${half(it.w / it.ratio)}in`;
  function whereText(it) {
    const a = AREAS[it.view];
    const down = half((box(it).top - a.y) / (INCH * ASPECT));
    const off = half((it.x - a.x) / INCH);
    const side = Math.abs(off) < 0.5 ? T.centred : fill(off > 0 ? T.rightOf : T.leftOf, { n: Math.abs(off) });
    return fill(T.where, { d: down, s: side });
  }

  // Draws the designs of one view. edit: the designer canvas, with the print
  // area and the selected design's handle.
  function placeAll(holder, view, list, selUid, edit) {
    holder.innerHTML = '';
    if (edit) {
      const a = AREAS[view];
      const area = make('div', 'area');
      area.style.cssText = `left:${a.x - pw(a.w) / 2}%;top:${a.y}%;width:${pw(a.w)}%;height:${ph(a.h)}%`;
      area.append(make('span', 'ph-tag', T.areaTag));
      holder.append(area);
    }
    list.filter((it) => it.src && it.view === view).forEach((it) => {
      const b = box(it);
      const el = make('div', 'ph' + (edit && it.uid === selUid ? ' sel' : ''));
      el.style.cssText = `left:${b.left}%;top:${b.top}%;width:${b.w}%;height:${b.h}%`;
      if (it.rot) el.style.transform = `rotate(${it.rot}deg)`;
      const img = make('img');
      img.src = it.src;
      img.alt = '';
      img.draggable = false;
      el.append(img);
      if (edit) {
        el.dataset.uid = it.uid;
        if (it.uid === selUid) {
          const handle = make('span', 'ph-h');
          handle.dataset.handle = '';
          const turn = make('span', 'ph-r');
          turn.dataset.rotate = '';
          turn.setAttribute('aria-label', T.rotate);
          el.append(handle, turn);
        }
      }
      holder.append(el);
    });
  }

  function drawStage(stage, view, list, selUid, edit) {
    const c = st.colour;
    const shirt = q('[data-shirt]', stage);
    const own = photoFor(view);
    const src = own || c.img;
    if (src) {
      shirt.removeAttribute('srcset');
      shirt.src = src;
    }
    shirt.alt = `${D.title}, ${c.name}`;
    const note = q('[data-back-note]', stage);
    if (note) note.hidden = view === 'front' || !!own;
    placeAll(q('[data-placements]', stage), view, list, selUid, edit);
  }

  // What the page stage shows: designer items only. Sent files are placed
  // by the studio, so the garment stays plain and the design card says so.
  function placedOnPage() {
    const d = st.design;
    return d && d.mode === 'designer' ? d.items : [];
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
      b.addEventListener('click', () => { st.colour = c; st.photo = null; render(); });
      box.append(b);
    });
  }

  function sizes() {
    const box = q('[data-sizes]');
    box.innerHTML = '';
    box.style.setProperty('--n', SIZES.length);
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

  // The discount counts this garment in every colour, so items of it
  // already in the basket count towards the meter too.
  let inBasket = 0;
  async function loadBasket() {
    try {
      const res = await fetch(D.cartJs, { headers: { Accept: 'application/json' } });
      const cart = await res.json();
      inBasket = (cart.items || []).filter((l) => l.product_id === D.productId).reduce((a, l) => a + l.quantity, 0);
    } catch (e) {
      inBasket = 0;
    }
    totals();
  }

  function totals() {
    const n = total() + inBasket;
    const next = nextTier(n);
    q('[data-total]').textContent = items(total());
    q('[data-nudge-pct]').textContent = rate(n) + '%';
    q('[data-nudge-bar]').style.width = Math.min(100, n * 2) + '%';
    q('[data-nudge-text]').textContent = next ? fill(T.addMore, { n: next - n, p: rate(next) }) : T.top;
    const nb = q('[data-nudge-basket]');
    nb.hidden = !inBasket;
    nb.textContent = inBasket ? fill(T.inBasket, { n: inBasket }) : '';
    const sum = `${items(total())} · ${st.colour.name}`;
    q('[data-sum]').textContent = sum;
    q('[data-mob-sum]').textContent = sum;
  }

  // One line per position: what goes there and how big.
  function describe() {
    const d = st.design;
    if (!d) return [];
    if (d.mode === 'designer') {
      const what = (it) => (it.kind === 'text' ? `${T.text}: "${it.lines.join(' / ')}" (${it.font}, ${it.ink.toUpperCase()})` : it.name);
      return VIEWS.filter((v) => d.items.some((it) => it.view === v)).map((v) => ({
        name: VIEW_NAME[v],
        text: d.items.filter((it) => it.view === v).map(what).join('; '),
        // Studio only: hidden from the customer (underscore property).
        detail: d.items.filter((it) => it.view === v).map((it) => `${what(it)} · ${sizeLabel(it)}, ${whereText(it)}${it.rot ? ', ' + fill(T.rotated, { n: it.rot }) : ''}`).join('; '),
      }));
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
    swatches();
    sizes();
    designCard();
    pagePhoto();
    totals();
  }

  // The main photo: the colour's own photo with the design on it, or one of
  // the product's other photos (no design). Back photos stay in the designer.
  const EXTRAS = D.extras || [];
  function pagePhoto() {
    const stage = q('[data-stage="page"]');
    const extra = st.photo === null ? null : EXTRAS[st.photo];
    if (extra) {
      const shirt = q('[data-shirt]', stage);
      shirt.removeAttribute('srcset');
      shirt.src = extra.img;
      shirt.alt = extra.alt || D.title;
      q('[data-placements]', stage).innerHTML = '';
    } else {
      drawStage(stage, 'front', placedOnPage(), null, false);
    }
    const box = q('[data-g-thumbs]');
    box.innerHTML = '';
    box.hidden = !EXTRAS.length;
    if (!EXTRAS.length) return;
    [{ thumb: st.colour.thumb, alt: st.colour.name, i: null }, ...EXTRAS.map((x, i) => ({ ...x, i }))].forEach((x) => {
      const b = make('button', 'g-thumb');
      b.type = 'button';
      b.setAttribute('aria-label', x.alt || D.title);
      b.setAttribute('aria-pressed', String(x.i === st.photo));
      if (x.thumb) {
        const img = make('img');
        img.src = x.thumb;
        img.alt = '';
        b.append(img);
      }
      b.addEventListener('click', () => { st.photo = x.i; pagePhoto(); });
      box.append(b);
    });
  }

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
  const dzs = { view: 'front', sel: null, items: [] };

  // Text fonts (Google Fonts, free to print with), loaded the first time
  // someone adds text. [family, weight]
  const FONTS = [
    ['Anton', 400], ['Bebas Neue', 400], ['Oswald', 700], ['Archivo Black', 400],
    ['Graduate', 400], ['Black Ops One', 400], ['Permanent Marker', 400], ['Pacifico', 400],
    ['Lobster', 400], ['Playfair Display', 700], ['Roboto Slab', 700], ['Montserrat', 700],
  ];
  const SWATCHES = ['#FFFFFF', '#1D1D1B', '#C8102E', '#1F2A44', '#0057B8', '#EB7024', '#FFD100', '#00843D', '#E56DB1', '#8A8D8F', '#B3A369', '#5F259F'];
  let fontsReady;
  function loadFonts() {
    if (!fontsReady) {
      const families = FONTS.map(([f, w]) => `family=${f.replace(/ /g, '+')}:wght@${w}`).join('&');
      const link = make('link');
      link.rel = 'stylesheet';
      link.href = `https://fonts.googleapis.com/css2?${families}&display=swap`;
      fontsReady = new Promise((r) => { link.onload = r; link.onerror = r; });
      document.head.append(link);
    }
    return fontsReady;
  }

  // Draws a text design to an image. With no text yet it shows "Your text"
  // so the customer sees it on the garment straight away.
  async function drawText(item) {
    item.placeholder = !item.lines.length;
    const lines = item.placeholder ? [T.yourText] : item.lines;
    await loadFonts();
    const font = `${item.weight} 160px "${item.font}"`;
    try { await document.fonts.load(font, lines.join('')); } catch (e) { /* draw with whatever has loaded */ }
    const cv = make('canvas');
    const cx = cv.getContext('2d');
    cx.font = font;
    cv.width = Math.ceil(Math.max(...lines.map((l) => cx.measureText(l).width))) + 40;
    cv.height = lines.length * 200 + 40;
    cx.font = font;
    cx.fillStyle = item.ink;
    cx.globalAlpha = item.placeholder ? 0.6 : 1;
    cx.textAlign = item.align;
    cx.textBaseline = 'top';
    const x = item.align === 'left' ? 20 : item.align === 'right' ? cv.width - 20 : cv.width / 2;
    lines.forEach((l, i) => cx.fillText(l, x, 20 + i * 200));
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

  // Best size for me / I need a specific size + width box.
  function sizePicker(p, value, onChange) {
    const row = make('div', 'fz-size');
    const sel = make('select');
    sel.setAttribute('aria-label', T.sizeLabel);
    const opts = [['best', T.bestSize]];
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

  function textForm(item) {
    const form = make('div', 'text-design');
    const field = (label, el, cls) => { const l = make('label', cls || '', label); l.append(el); form.append(l); return el; };
    const line = (label, i) => field(label, Object.assign(make('input'), { type: 'text', maxLength: 30, value: item.lines[i] || '', placeholder: i === 0 ? T.yourText : '' }), 'wide');
    const l1 = line(T.line1, 0);
    const l2 = line(T.line2, 1);
    const l3 = line(T.line3, 2);
    const fontSel = make('select');
    FONTS.forEach(([f]) => {
      const o = make('option', '', f);
      o.value = f;
      o.style.fontFamily = `"${f}"`;
      o.selected = f === item.font;
      fontSel.append(o);
    });
    field(T.font, fontSel, 'wide');

    const colours = make('div', 'ink-row');
    const picker = Object.assign(make('input'), { type: 'color', value: item.ink });
    picker.setAttribute('aria-label', T.customColour);
    SWATCHES.forEach((hex) => {
      const b = make('button', 'ink');
      b.type = 'button';
      b.style.setProperty('--c', hex);
      b.setAttribute('aria-label', hex);
      b.setAttribute('aria-pressed', String(hex.toLowerCase() === item.ink.toLowerCase()));
      b.addEventListener('click', () => { picker.value = hex; update(); });
      colours.append(b);
    });
    const pl = make('label', 'ink-custom', T.customColour);
    pl.prepend(picker);
    colours.append(pl);
    const cl = make('div', 'wide');
    cl.append(make('span', 'field-label', T.colour), colours);
    form.append(cl);

    const align = make('div', 'align-row');
    [['left', T.alignLeft], ['center', T.alignCentre], ['right', T.alignRight]].forEach(([v, t]) => {
      const b = make('button', '', t);
      b.type = 'button';
      b.dataset.align = v;
      b.setAttribute('aria-pressed', String(item.align === v));
      b.addEventListener('click', () => { item.align = v; update(); });
      align.append(b);
    });
    const al = make('div', 'wide');
    al.append(make('span', 'field-label', T.align), align);
    form.append(al);

    let busy = Promise.resolve();
    function update() {
      Object.assign(item, {
        lines: [l1.value.trim(), l2.value.trim(), l3.value.trim()].filter(Boolean),
        font: fontSel.value,
        weight: (FONTS.find(([f]) => f === fontSel.value) || FONTS[0])[1],
        ink: picker.value,
      });
      qa('.ink', colours).forEach((b) => b.setAttribute('aria-pressed', String(b.getAttribute('aria-label').toLowerCase() === item.ink.toLowerCase())));
      qa('[data-align]', align).forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.align === item.align)));
      busy = busy.then(async () => {
        await drawText(item);
        fit(item);
        dzStage();
        dzThumbs();
        dzInfo();
      });
    }
    [l1, l2, l3, fontSel, picker].forEach((el) => el.addEventListener('input', update));
    return form;
  }

  const selected = () => dzs.items.find((it) => it.uid === dzs.sel);
  let uidN = 0;
  const uid = () => 'd' + Date.now().toString(36) + (uidN++);

  // A new design starts in the middle of the print area at 60% of its width.
  async function place(it) {
    const a = AREAS[dzs.view];
    Object.assign(it, { uid: uid(), view: dzs.view, w: a.w * 0.6, x: a.x, y: a.y + ph(a.h) / 2 });
    if (it.kind === 'text') await drawText(it);
    fit(it);
    dzs.items.push(it);
    dzs.sel = it.uid;
    dzRender();
  }

  function dzInfo() {
    const info = q('[data-dz-info]', dz);
    if (!info) return;
    const it = selected();
    info.innerHTML = '';
    if (!it || !it.src) return;
    if (check(it.w, it) === T.low) info.append(make('span', 'low', T.low));
  }

  function dzPanel() {
    const panel = q('[data-dz-panel]', dz);
    panel.innerHTML = '';
    panel.append(make('h3', '', VIEW_NAME[dzs.view]));

    const here = dzs.items.filter((it) => it.view === dzs.view);
    if (!here.length) { panel.append(make('p', 'muted', T.emptyView)); return; }
    if (here.length > 1) {
      const chips = make('div', 'fz-pos');
      here.forEach((it, i) => {
        const b = make('button', '', it.kind === 'text' ? `${T.text} ${i + 1}` : it.name);
        b.type = 'button';
        b.setAttribute('aria-pressed', String(it.uid === dzs.sel));
        b.addEventListener('click', () => { dzs.sel = it.uid; dzStage(); dzPanel(); });
        chips.append(b);
      });
      panel.append(chips);
    }
    const it = selected();
    if (!it || it.view !== dzs.view) { panel.append(make('p', 'muted', T.tapToEdit)); return; }
    panel.append(make('p', 'muted', T.dragHint));
    const info = make('div', 'dz-info');
    info.setAttribute('data-dz-info', '');
    panel.append(info);
    dzInfo();
    if (it.kind === 'text') panel.append(textForm(it));
    const row = make('div', 'dz-choice');
    if (it.kind === 'upload') {
      row.append(fileButton(T.replace, (fresh) => {
        Object.assign(it, { src: fresh.src, ratio: fresh.ratio, px: fresh.px, name: fresh.name, file: fresh.file, vector: fresh.vector });
        fit(it);
        dzRender();
      }));
    }
    const rm = make('button', 'text-btn', T.remove);
    rm.type = 'button';
    rm.addEventListener('click', () => {
      dzs.items = dzs.items.filter((x) => x !== it);
      dzs.sel = null;
      dzRender();
    });
    row.append(rm);
    panel.append(row);
  }

  // The add buttons at the top of the side panel.
  function dzAdd() {
    const box = q('[data-dz-add]', dz);
    box.innerHTML = '';
    const any = dzs.items.some((it) => it.src);
    const up = fileButton(any ? T.addAnother : T.addDesign, (it) => place(it));
    up.className = 'pill pill-o dz-add-main';
    const textBtn = make('button', 'pill pill-l', T.addText);
    textBtn.type = 'button';
    textBtn.addEventListener('click', () => place({ kind: 'text', lines: [], font: FONTS[0][0], weight: FONTS[0][1], ink: '#1D1D1B', align: 'center' }));
    box.append(up, textBtn);
  }

  // Mini thumbnails under the canvas, one per view, each with its designs.
  function dzThumbs() {
    const holder = q('[data-dz-views]', dz);
    holder.innerHTML = '';
    holder.hidden = VIEWS.length < 2;
    VIEWS.forEach((v) => {
      const b = make('button', 'vthumb');
      b.type = 'button';
      b.setAttribute('aria-pressed', String(v === dzs.view));
      const pic = make('span', 'vt-pic');
      const img = make('img');
      img.src = photoFor(v) || st.colour.img || '';
      img.alt = '';
      const marks = make('span', 'vt-marks');
      placeAll(marks, v, dzs.items, null, false);
      pic.append(img, marks);
      const label = make('span', 'vt-name', VIEW_NAME[v]);
      if (dzs.items.some((it) => it.view === v && it.src)) label.classList.add('filled');
      b.append(pic, label);
      b.addEventListener('click', () => {
        dzs.view = v;
        if (selected() && selected().view !== v) dzs.sel = null;
        dzRender();
      });
      holder.append(b);
    });
  }

  function dzStage() {
    drawStage(q('[data-stage="designer"]', dz), dzs.view, dzs.items, dzs.sel, true);
  }

  function dzRender() {
    dzThumbs();
    dzAdd();
    dzStage();
    dzPanel();
  }

  // Drag a design to move it; drag its round corner to resize it. The print
  // size shows on the design only while dragging.
  q('[data-stage="designer"]', dz).addEventListener('pointerdown', (e) => {
    const el = e.target.closest('.ph[data-uid]');
    if (!el) {
      if (dzs.sel) { dzs.sel = null; dzStage(); dzPanel(); }
      return;
    }
    e.preventDefault();
    const it = dzs.items.find((x) => x.uid === el.dataset.uid);
    const resize = !!e.target.closest('[data-handle]');
    const turn = !!e.target.closest('[data-rotate]');
    if (dzs.sel !== it.uid) { dzs.sel = it.uid; dzStage(); dzPanel(); }
    const rect = q('[data-stage="designer"] [data-zoom]', dz).getBoundingClientRect();
    const node = () => q(`.ph[data-uid="${it.uid}"]`, dz);
    const start = { cx: e.clientX, cy: e.clientY, x: it.x, y: it.y, w: it.w, rot: it.rot || 0 };
    // Rotation turns around the design's centre and snaps to straight within 4 degrees.
    const mid = () => { const r = node().getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; };
    const angle = (x, y) => { const m = mid(); return (Math.atan2(y - m.y, x - m.x) * 180) / Math.PI; };
    const a0 = turn ? angle(e.clientX, e.clientY) : 0;
    const label = () => (turn ? `${it.rot || 0}°` : dragSize(it));
    const tag = make('span', 'ph-tag', label());
    node().append(tag);
    const move = (ev) => {
      const dx = ((ev.clientX - start.cx) / rect.width) * 100;
      const dy = ((ev.clientY - start.cy) / rect.height) * 100;
      if (turn) {
        let r = Math.round(start.rot + angle(ev.clientX, ev.clientY) - a0);
        r = ((r % 360) + 540) % 360 - 180;
        const near = Math.round(r / 90) * 90;
        if (Math.abs(r - near) <= 4) r = near;
        it.rot = r === -180 ? 180 : r;
        node().style.transform = it.rot ? `rotate(${it.rot}deg)` : '';
        tag.textContent = label();
        return;
      }
      if (resize) it.w = start.w + Math.max((dx * 2) / INCH, ((dy * 2) / (INCH * ASPECT)) * it.ratio);
      else { it.x = start.x + dx; it.y = start.y + dy; }
      fit(it);
      const b = box(it);
      Object.assign(node().style, { left: b.left + '%', top: b.top + '%', width: b.w + '%', height: b.h + '%' });
      tag.textContent = label();
      dzInfo();
    };
    const up = () => {
      tag.remove();
      dzThumbs();
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  });

  function openDesigner() {
    const d = st.design;
    dzs.items = d && d.mode === 'designer' ? d.items.map((it) => ({ ...it })) : [];
    dzs.view = VIEWS.includes(st.view) ? st.view : 'front';
    dzs.sel = null;
    dzRender();
    dz.showModal();
  }
  q('[data-dz-close]', dz).addEventListener('click', () => dz.close());
  qa('[data-dz-save]', dz).forEach((b) => b.addEventListener('click', () => {
    // Text that was never typed is left out.
    const items = dzs.items.filter((it) => it.src && !it.placeholder);
    st.design = items.length ? { mode: 'designer', items } : null;
    st.view = dzs.view === 'back' ? 'back' : 'front';
    st.photo = null;
    dz.close();
    render();
  }));

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
      fzs.files.push({ file, name: file.name, thumb: t ? t.src : null, ratio: t ? t.ratio : 1, at: {} });
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
    for (const it of d.items) {
      if (it.kind === 'upload') out.push([it.file, it.name]);
      else out.push([await dataUrlToBlob(it.src), `${it.view}-text.png`]);
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
        if (!D.quoteOnly) body.append('properties[_buy]', '1');
        if (!st.design) body.append(`properties[${T.printLabel}]`, T.noDesign);
        else body.append(`properties[${T.printLabel}]`, st.design.mode === 'designer' ? T.designedOnline : T.filesSent);
        rows.forEach((r) => {
          body.append(`properties[${r.name}]`, r.text);
          if (r.detail) body.append(`properties[_${r.name} ${T.placement}]`, r.detail);
        });
        if (st.design && st.design.mode === 'files' && st.design.note) body.append(`properties[${T.note}]`, st.design.note);
        if (i === 0) files.forEach(([blob, name], n) => body.append(`properties[${T.artwork} ${n + 1}]`, blob, name));
        const res = await fetch(D.cartAdd, { method: 'POST', body, headers: { Accept: 'application/json' } });
        if (!res.ok) throw new Error(String(res.status));
      }
      if (!D.quoteOnly) {
        // Buy now: straight to checkout, unless quote items are also in the
        // basket (checkout takes the whole basket), then the basket page.
        msg.textContent = T.toCheckout;
        const cart = await (await fetch(D.cartJs)).json();
        const onlyBuy = cart.items.every((it) => it.properties && it.properties._buy);
        window.location.href = onlyBuy ? D.checkoutUrl : D.cartUrl;
        return;
      }
      msg.innerHTML = fill(T.added, { u: D.cartUrl });
      // Clear the sizes so the next colour starts at 0; the meter now counts
      // what was just added from the basket.
      st.qty = {};
      sizes();
      loadBasket();
      document.dispatchEvent(new CustomEvent('cft:basket-changed'));
    } catch (e) {
      msg.textContent = T.addFail;
    }
  }
  qa('[data-add]').forEach((b) => b.addEventListener('click', addToBasket));

  /* ---------- size guide ---------- */

  const dlg = q('[data-size-dlg]');
  if (dlg) {
    q('[data-size-open]').addEventListener('click', () => dlg.showModal());
    q('[data-size-close]').addEventListener('click', () => dlg.close());
    dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });
  }

  render();
  loadBasket();
})();
