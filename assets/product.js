/**
 * Product page quote builder: colour, size grid with the bulk discount
 * nudge, and the design step (upload or text, click a print position, set
 * width, height from the trimmed design, artwork check). Reads its data from
 * the JSON the product-builder block writes. Nothing goes in a cart.
 */
(() => {
  const root = document.getElementById('pdp');
  const dataEl = document.querySelector('[data-pdp-data]');
  if (!root || !dataEl) return;
  const D = JSON.parse(dataEl.textContent);
  const T = D.t;
  const q = (sel) => document.querySelector(sel);
  const qa = (sel) => [...document.querySelectorAll(sel)];
  const fill = (s, map) => Object.entries(map).reduce((out, [k, v]) => out.split('%' + k).join(v), s);

  // Default positions on a flat front shot. x and y are % of the photo; one
  // inch covers about 2.4% of the photo width. A product can override these
  // with its cft.print_positions metafield.
  const DEFAULT = {
    inch: 2.4,
    positions: [
      { id: 'lc', w: 4, x: 62, y: 30, view: 'front' },
      { id: 'rc', w: 4, x: 38, y: 30, view: 'front' },
      { id: 'ff', w: 11, x: 50, y: 30, view: 'front' },
      { id: 'fb', w: 12, x: 50, y: 27, view: 'back' },
      { id: 'ls', w: 3, x: 85, y: 33, view: 'front' },
      { id: 'rs', w: 3, x: 15, y: 33, view: 'front' },
    ],
  };
  const PRINT = D.print && D.print.positions ? D.print : DEFAULT;
  const INCH = PRINT.inch || DEFAULT.inch;
  const POS = PRINT.positions.map((p) => ({ ...p, name: p.name || T.pos[p.id] || p.id }));

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

  const st = {
    colour: COLOURS.find((c) => c.name === D.selectedColour) || COLOURS[0],
    qty: {},
    pos: new Set(POS.some((p) => p.id === 'lc') ? ['lc'] : []),
    view: 'front',
    mode: 'logo',
    logo: null,
    text: null,
    file: null,
  };
  const design = () => (st.mode === 'text' ? st.text : st.logo);

  const total = () => SIZES.reduce((n, s) => n + (st.colour.sizes.includes(s) ? st.qty[s] || 0 : 0), 0);
  const items = (n) => (n === 1 ? T.itemsOne : fill(T.itemsOther, { n }));
  const positionsText = (n) => (n === 1 ? T.posOne : fill(T.posOther, { n }));

  function swatches() {
    const box = q('[data-swatches]');
    box.innerHTML = '';
    COLOURS.forEach((c) => {
      const b = document.createElement('button');
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
      const label = document.createElement('label');
      if (!ok) label.className = 'na';
      const input = document.createElement('input');
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
    summary();
  }

  // Artwork check: compare the trimmed design's pixel width with the print width.
  function check(p) {
    const d = design();
    if (!d || d.kind === 'text') return '';
    if (d.vector) return T.vector;
    const dpi = d.px / p.w;
    return dpi >= 200 ? T.good : dpi >= 120 ? T.ok : T.low;
  }

  function positions() {
    const box = q('[data-pos]');
    box.innerHTML = '';
    POS.forEach((p) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.setAttribute('aria-pressed', String(st.pos.has(p.id)));
      b.innerHTML = '<b></b><span></span>';
      b.querySelector('b').textContent = p.name;
      b.querySelector('span').textContent = fill(T.inWide, { w: p.w });
      b.addEventListener('click', () => {
        if (st.pos.has(p.id)) st.pos.delete(p.id);
        else { st.pos.add(p.id); st.view = p.view; }
        render();
      });
      box.append(b);
    });

    const list = q('[data-chosen]');
    list.innerHTML = '';
    const d = design();
    POS.filter((p) => st.pos.has(p.id)).forEach((p) => {
      const li = document.createElement('li');
      li.innerHTML = '<div><b></b><small></small></div><span></span>';
      li.querySelector('b').textContent = p.name;
      li.querySelector('span').textContent = d ? fill(T.wxh, { w: p.w, h: (p.w / d.ratio).toFixed(1) }) : fill(T.inWide, { w: p.w });
      const note = check(p);
      li.querySelector('small').textContent = note;
      if (note === T.low) li.classList.add('low');
      list.append(li);
    });
    q('[data-pos-count]').textContent = st.pos.size ? positionsText(st.pos.size) : T.pick;
  }

  function stage() {
    const c = st.colour;
    const shirt = q('[data-shirt]');
    if (c.img) {
      shirt.removeAttribute('srcset');
      shirt.src = c.img;
    }
    shirt.alt = `${D.title}, ${c.name}, ${T.front}`;
    qa('[data-view]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.view === st.view)));
    q('[data-back-note]').hidden = st.view !== 'back';

    const box = q('[data-placements]');
    box.innerHTML = '';
    const d = design();
    POS.filter((p) => st.pos.has(p.id) && p.view === st.view).forEach((p) => {
      const w = p.w * INCH;
      const el = document.createElement('div');
      el.className = 'ph' + (d ? '' : ' empty');
      el.style.cssText = `left:${p.x - w / 2}%;top:${p.y}%;width:${w}%`;
      el.innerHTML = '<span class="ph-tag"></span>';
      el.firstChild.textContent = `${p.name} ${p.w}in`;
      if (d) {
        const img = document.createElement('img');
        img.src = d.src;
        img.alt = '';
        el.append(img);
      }
      box.append(el);
    });
  }

  function summary() {
    const n = total();
    q('[data-sum]').textContent = `${items(n)} · ${st.colour.name} · ${positionsText(st.pos.size)}`;
    q('[data-mob-sum]').textContent = `${items(n)} · ${positionsText(st.pos.size)}`;
  }

  function designPanel() {
    qa('[data-mode]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.mode === st.mode)));
    q('[data-upload]').hidden = st.mode !== 'logo';
    q('[data-text-design]').hidden = st.mode !== 'text';
    const up = q('[data-upload]');
    up.classList.toggle('has', !!st.logo);
    q('[data-thumb]').style.backgroundImage = st.logo ? `url("${st.logo.src}")` : '';
    if (st.logo) {
      q('[data-up-name]').textContent = st.logo.name;
      q('[data-up-meta]').textContent = T.uploadDone;
    }
  }

  function render() {
    q('[data-colour-name]').textContent = st.colour.name;
    swatches();
    sizes();
    designPanel();
    positions();
    stage();
    totals();
  }

  // Trim transparent edges so the height comes from the drawn design, as in
  // the staff proof tool.
  function trim(img) {
    const cv = document.createElement('canvas');
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
      const out = document.createElement('canvas');
      out.width = x1 - x0 + 1;
      out.height = y1 - y0 + 1;
      out.getContext('2d').drawImage(cv, x0, y0, out.width, out.height, 0, 0, out.width, out.height);
      return { src: out.toDataURL('image/png'), ratio: out.width / out.height, px: out.width };
    } catch (e) {
      return whole;
    }
  }

  q('[data-file]').addEventListener('change', (e) => {
    const f = e.target.files[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const t = trim(img);
        st.logo = { ...t, name: f.name, kind: 'upload', vector: f.type === 'image/svg+xml' };
        st.file = f;
        render();
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(f);
  });

  // Text design: drawn to a canvas, then treated like an uploaded design.
  async function drawText() {
    const lines = qa('[data-text]').map((i) => i.value.trim()).filter(Boolean);
    if (!lines.length) { st.text = null; render(); return; }
    const fontVar = q('[data-font]').value;
    const family = getComputedStyle(document.documentElement).getPropertyValue('--' + fontVar).trim() || 'sans-serif';
    const font = `700 160px ${family}`;
    try { await document.fonts.load(font); } catch (e) { /* draw with whatever has loaded */ }
    const cv = document.createElement('canvas');
    const cx = cv.getContext('2d');
    cx.font = font;
    const width = Math.max(...lines.map((l) => cx.measureText(l).width));
    cv.width = Math.ceil(width) + 40;
    cv.height = lines.length * 190 + 40;
    cx.font = font;
    cx.fillStyle = q('[data-ink]').value;
    cx.textAlign = 'center';
    cx.textBaseline = 'top';
    lines.forEach((l, i) => cx.fillText(l, cv.width / 2, 20 + i * 190));
    const img = new Image();
    img.onload = () => {
      st.text = { ...trim(img), kind: 'text', lines, font: q('[data-font]').selectedOptions[0].text, ink: q('[data-ink]').selectedOptions[0].text };
      render();
    };
    img.src = cv.toDataURL('image/png');
  }
  qa('[data-text], [data-font], [data-ink]').forEach((el) => el.addEventListener('input', drawText));

  qa('[data-mode]').forEach((b) => b.addEventListener('click', () => { st.mode = b.dataset.mode; render(); }));
  qa('[data-view]').forEach((b) => b.addEventListener('click', () => { st.view = b.dataset.view; render(); }));

  const dlg = q('[data-size-dlg]');
  if (dlg) {
    q('[data-size-open]').addEventListener('click', () => dlg.showModal());
    q('[data-size-close]').addEventListener('click', () => dlg.close());
    dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });
  }

  // Send for quote: posts the request to the Business Hub once its address is
  // set in theme settings. Until then it says quote requests are not on yet.
  const msg = q('[data-send-msg]');
  async function send() {
    msg.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    if (!total() || !st.pos.size) { msg.textContent = T.missing; return; }
    if (!D.endpoint) { msg.textContent = T.off; return; }
    const d = design();
    const lines = SIZES.filter((s) => st.colour.sizes.includes(s) && st.qty[s]).map((s) => {
      const v = st.colour.variants.find((x) => x.size === s);
      return { variantId: v.id, sku: v.sku, size: s, quantity: st.qty[s] };
    });
    const payload = {
      productId: D.productId,
      handle: D.handle,
      colour: st.colour.name,
      lines,
      positions: POS.filter((p) => st.pos.has(p.id)).map((p) => ({
        id: p.id, name: p.name, widthIn: p.w, heightIn: d ? +(p.w / d.ratio).toFixed(1) : null,
      })),
      design: d ? { kind: d.kind, name: d.name || null, lines: d.lines || null, font: d.font || null, ink: d.ink || null } : null,
    };
    const body = new FormData();
    body.append('quote', JSON.stringify(payload));
    if (st.mode === 'logo' && st.file) body.append('artwork', st.file);
    else if (d) body.append('artwork', await (await fetch(d.src)).blob(), 'text-design.png');
    msg.textContent = T.busy;
    try {
      const res = await fetch(D.endpoint, { method: 'POST', body });
      msg.textContent = res.ok ? T.sent : T.fail;
    } catch (e) {
      msg.textContent = T.fail;
    }
  }
  qa('[data-send]').forEach((b) => b.addEventListener('click', send));

  q('[data-pos-table]').innerHTML = '';
  POS.forEach((p) => {
    const tr = document.createElement('tr');
    tr.innerHTML = '<td></td><td></td>';
    tr.children[0].textContent = p.name;
    tr.children[1].textContent = fill(T.inches, { w: p.w });
    q('[data-pos-table]').append(tr);
  });

  render();
})();
