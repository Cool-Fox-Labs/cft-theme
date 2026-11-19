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
  // Shopify's t filter HTML-escapes text (' becomes &#39;), and these
  // strings are shown with textContent, so turn the entities back first.
  const unescape = (v) => { const el = document.createElement('textarea'); el.innerHTML = v; return el.value; };
  const T = Object.fromEntries(Object.entries(D.t || {}).map(([k, v]) => [k, typeof v === 'string' ? unescape(v) : v]));
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
  // Headwear: Front only, on the front patch. One inch covers about 7.5% of
  // a straight-on cap front photo. Print Studio's rule, exactly: a headwear
  // word in the product type or title, once "cap sleeve" is taken out.
  const HEAD_TEXT = `${D.productType || ''} ${D.title || ''}`.toLowerCase().replace(/\bcap[\s-]+sleeved?s?\b/g, '');
  const HEADWEAR = /\b(cap|caps|hat|hats|beanie|beanies|headwear|visor|bucket)\b/.test(HEAD_TEXT);
  const HEAD = { inch: 7.5, positions: [{ id: 'fr', w: 3, x: 50, y: 40, view: 'front' }] };
  const PRINT = HEADWEAR ? HEAD : D.print && D.print.positions ? D.print : DEFAULT;
  const INCH = PRINT.inch || DEFAULT.inch;
  // Print sides (Print Studio, product metafield cft.print_sides): a list of
  // "Front", "Back", "Left sleeve", "Right sleeve". Missing: headwear Front
  // only, bags Front and Back, everything else all four (Print Studio's
  // defaults). Front always stays. Positions and views of other sides hide.
  const BAG = !HEADWEAR && /\b(bag|bags|tote|totes|backpack|rucksack|holdall|sack)\b/.test(HEAD_TEXT);
  const ALL_SIDES = ['Front', 'Back', 'Left sleeve', 'Right sleeve'];
  const ownSides = Array.isArray(D.sides) ? D.sides.filter((x) => ALL_SIDES.includes(x)) : [];
  const SIDES = ownSides.length ? ownSides : HEADWEAR ? ['Front'] : BAG ? ['Front', 'Back'] : ALL_SIDES;
  const SIDE_OF = { fb: 'Back', back: 'Back', ls: 'Left sleeve', rs: 'Right sleeve' };
  const sideOk = (id) => !SIDE_OF[id] || SIDES.includes(SIDE_OF[id]);
  const POS = PRINT.positions.filter((p) => sideOk(p.id) && (!p.view || sideOk(p.view))).map((p) => ({ ...p, name: p.name || T.pos[p.id] || p.id }));
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
  // own photo, or the front view's "images" entry for the colour when the
  // metafield has one (Print Studio's AI photos), in the designer and once a
  // design is on the page. Back and sleeves appear only when the product's
  // cft.print_positions metafield lists them under "views", each with its
  // print area and a photo per colour:
  //   {"inch": 2.4, "views": [{"id": "back", "area": {"w": 12, "h": 14, "x": 50, "y": 22},
  //     "images": {"Black": "https://…", "default": "https://…"}}]}
  // x is the centre and y the top of the area, as % of the photo; w and h are inches.
  const ASPECT = 5 / 6; // stage width / height
  // inch: how much of the photo width one inch covers (it can differ per view
  // and colour when Print Studio sets the area, see areaOf).
  const pw = (inches, inch = INCH) => inches * inch; // inches to % of photo width
  const ph = (inches, inch = INCH) => inches * inch * ASPECT; // inches to % of photo height
  const half = (n) => Math.round(n * 2) / 2;
  const BASE_AREA = {
    front: { w: 12, h: 14, x: 50, y: 25 },
    back: { w: 12, h: 14, x: 50, y: 22 },
    ls: { w: 4, h: 4, x: 50, y: 35 },
    rs: { w: 4, h: 4, x: 50, y: 35 },
  };
  const DEFAULT_NAME = { front: T.pos.fr, back: T.pos.fb, ls: T.pos.ls, rs: T.pos.rs };
  if (HEADWEAR) BASE_AREA.front = { w: 4.5, h: 3.2, x: 50, y: 35 };
  const listed = D.print && Array.isArray(D.print.views) ? D.print.views.filter((v) => v && v.id && (!HEADWEAR || v.id === 'front') && sideOk(v.id)) : [];
  const VIEW_LIST = ['front', ...listed.map((v) => v.id).filter((id) => id !== 'front')].map((id) => {
    const v = listed.find((x) => x.id === id) || {};
    return { id, name: v.name || DEFAULT_NAME[id] || id, area: { ...(BASE_AREA[id] || BASE_AREA.front), ...(v.area || {}) }, images: v.images || null, ps: Array.isArray(v.psAreas) ? v.psAreas.filter((a) => a && a.w > 0 && a.h > 0 && a.inW > 0) : [] };
  });
  const VIEWS = VIEW_LIST.map((v) => v.id);
  const AREAS = Object.fromEntries(VIEW_LIST.map((v) => [v.id, v.area]));
  // Print Studio's print box for this view and colour (cft.print_positions
  // views[].psAreas), used only while its own photo is showing: x/y are the
  // box centre and w/h its size, all % of the photo; inW its real width in
  // inches; "colours" (keyed by the colour name lower-cased, letters and
  // digits only) moves it per colour. With several boxes on a view the
  // widest is the print area. Returns the area in theme units:
  // { w, h inches, x centre %, y top %, inch, rot }.
  const colourKey = (name) => String(name).toLowerCase().replace(/[^a-z0-9]/g, '');
  // The front's boxes are drawn on whichever front photo shows (Print
  // Studio draws garment fronts on the colour's own shop photo); back and
  // sleeves only while that view's own photo shows.
  const shownPhoto = (view) => photoFor(view) || (view === 'front' ? st.colour.img : null);
  function areaOf(view) {
    const base = { ...AREAS[view], inch: INCH, rot: 0 };
    base.hb = base.h;
    const v = VIEW_LIST.find((x) => x.id === view);
    const shown = v && v.ps.length ? shownPhoto(view) : null;
    if (!shown) return base;
    const main = v.ps.reduce((a, b) => (b.inW > a.inW ? b : a));
    const own = main.colours && main.colours[colourKey(st.colour.name)];
    const b = toStage({ ...main, ...(own || {}) }, photoRatio(shown));
    if (!(b.w > 0 && b.h > 0)) return base;
    const inch = b.w / main.inW;
    // h: the real height in inches - the one typed in Print Studio (inH)
    // when there is one, else worked out from the box. hb: the box's own
    // height in inches at this scale, for drawing it and keeping designs in.
    const hb = b.h / (inch * ASPECT);
    return { w: main.inW, h: main.inH > 0 ? main.inH : hb, hb, x: b.x, y: b.y - b.h / 2, inch, rot: b.rot || 0 };
  }
  // Print Studio's boxes are % of the photo itself, but the stage is 5:6
  // and shows the photo with object-fit: contain, so a photo of another
  // shape is letterboxed. Turns a box into % of the stage. r is the
  // photo's width / height (null until it has loaded: taken as 5:6).
  function toStage(b, r) {
    if (!r) return b;
    if (r > ASPECT) { const k = ASPECT / r; return { ...b, y: 50 + (b.y - 50) * k, h: b.h * k }; }
    const k = r / ASPECT;
    return { ...b, x: 50 + (b.x - 50) * k, w: b.w * k };
  }
  // Each photo's width / height, read once. When one arrives the print
  // areas may move, so the designs are fitted again and redrawn.
  const RATIO = {};
  function photoRatio(url) {
    if (url in RATIO) return RATIO[url];
    RATIO[url] = null;
    const img = new Image();
    img.onload = () => {
      if (!img.naturalWidth || !img.naturalHeight) return;
      RATIO[url] = img.naturalWidth / img.naturalHeight;
      refit();
    };
    img.src = url;
    return null;
  }
  const VIEW_NAME = Object.fromEntries(VIEW_LIST.map((v) => [v.id, v.name]));
  // The view's own photo for the chosen colour, or null to use the front photo.
  function photoFor(id) {
    const v = VIEW_LIST.find((x) => x.id === id);
    const own = v && v.images ? v.images[st.colour.name] : null;
    // Front: Print Studio's photo for this colour (it keeps it up to date,
    // regenerated photos included), then the straight-on headwear photo
    // found by name in Files. No "default" - the colour's own photo is better.
    if (id === 'front') return own || st.colour.front || null;
    return own || (v && v.images && v.images.default) || null;
  }

  // A placed design: x and y are its centre as % of the photo, w its width in inches.
  function box(it) {
    const { inch } = areaOf(it.view);
    const w = pw(it.w, inch);
    const h = ph(it.w / it.ratio, inch);
    return { left: it.x - w / 2, top: it.y - h / 2, w, h };
  }
  // Keep a design inside its print area.
  function fit(it) {
    const a = areaOf(it.view);
    it.w = Math.max(1, Math.min(it.w, a.w, Math.min(a.h, a.hb) * it.ratio));
    const b = box(it);
    const left = a.x - pw(a.w, a.inch) / 2;
    const right = a.x + pw(a.w, a.inch) / 2;
    it.x = Math.min(Math.max(it.x, left + b.w / 2), right - b.w / 2);
    it.y = Math.min(Math.max(it.y, a.y + b.h / 2), a.y + ph(a.hb, a.inch) - b.h / 2);
  }
  // The print areas changed (another colour, or a photo arrived): keep every
  // design inside its area and redraw.
  function refit() {
    const d = st.design;
    if (d && d.mode === 'designer') d.items.forEach(fit);
    pagePhoto();
    if (dz.open) {
      dzs.items.filter((it) => it.src).forEach(fit);
      dzRender();
    }
  }
  const sizeLabel = (it) => fill(T.wxh, { w: half(it.w), h: half(it.w / it.ratio) });
  const dragSize = (it) => `${half(it.w)} × ${half(it.w / it.ratio)}in`;
  function whereText(it) {
    const a = areaOf(it.view);
    const down = half((box(it).top - a.y) / (a.inch * ASPECT));
    const off = half((it.x - a.x) / a.inch);
    const side = Math.abs(off) < 0.5 ? T.centred : fill(off > 0 ? T.rightOf : T.leftOf, { n: Math.abs(off) });
    return fill(T.where, { d: down, s: side });
  }

  // Draws the designs of one view. edit: the designer canvas, with the print
  // area and the selected design's handle.
  function placeAll(holder, view, list, selUid, edit) {
    holder.innerHTML = '';
    if (edit) {
      const a = areaOf(view);
      const area = make('div', 'area');
      area.style.cssText = `left:${a.x - pw(a.w, a.inch) / 2}%;top:${a.y}%;width:${pw(a.w, a.inch)}%;height:${ph(a.hb, a.inch)}%`;
      if (a.rot) area.style.transform = `rotate(${a.rot}deg)`;
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
    // The page photo stays the listing photo until a design is on it.
    const plain = view === 'front' && !edit && !list.some((it) => it.src && it.view === 'front');
    const own = plain ? null : photoFor(view);
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
      b.addEventListener('click', () => {
        st.colour = c;
        st.photo = null;
        const d = st.design;
        if (d && d.mode === 'designer') d.items.forEach(fit);
        render();
      });
      box.append(b);
    });
  }

  // A size can be picked when this colour is made in it and it is in stock.
  const variantOf = (s) => st.colour.variants.find((v) => v.size === s);
  const canPick = (s) => { const v = variantOf(s); return !!v && v.available !== false; };

  function sizes() {
    const box = q('[data-sizes]');
    box.innerHTML = '';
    box.style.setProperty('--n', SIZES.length);
    SIZES.forEach((s) => {
      const v = variantOf(s);
      const ok = canPick(s);
      const sold = !!v && !ok;
      const cell = make('div', ok ? 'sz' : sold ? 'sz na sold' : 'sz na');
      const input = make('input');
      Object.assign(input, { type: 'number', inputMode: 'numeric', min: 0, placeholder: '0', disabled: !ok });
      if (ok && v.max != null) input.max = v.max;
      input.setAttribute('aria-label', fill(T.qtyFor, { s }));
      if (ok && st.qty[s]) input.value = st.qty[s];
      const set = (n) => {
        let k = Math.max(0, n);
        if (ok && v.max != null && k > v.max) {
          k = v.max;
          popup(T.maxTitle, fill(T.maxText, { n: v.max, s }));
        }
        st.qty[s] = k;
        input.value = k || '';
        totals();
      };
      input.addEventListener('change', () => set(parseInt(input.value, 10) || 0));
      input.addEventListener('input', () => { st.qty[s] = Math.max(0, parseInt(input.value, 10) || 0); totals(); });
      const minus = make('button', 'sz-b', '\u2212');
      const plus = make('button', 'sz-b', '+');
      [[minus, -1, T.less], [plus, 1, T.more]].forEach(([b, d, lab]) => {
        Object.assign(b, { type: 'button', disabled: !ok });
        b.setAttribute('aria-label', fill(lab, { s }));
        b.addEventListener('click', () => set((st.qty[s] || 0) + d));
      });
      const row = make('div', 'sz-row');
      row.append(minus, input, plus);
      cell.append(make('span', 'sz-name', s), row);
      if (sold) cell.append(make('span', 'sz-out', T.outOfStock));
      box.append(cell);
    });
    q('[data-size-note]').textContent = st.colour.sizes.length < SIZES.length ? T.notMade : '';
  }

  // The discount counts this garment in every colour, so items of it
  // already in the basket count towards the meter too.
  // basketQty: how many of each variant the basket holds, for the stock cap.
  let inBasket = 0;
  let basketQty = {};
  async function loadBasket() {
    try {
      const res = await fetch(D.cartJs, { headers: { Accept: 'application/json' } });
      const cart = await res.json();
      const mine = (cart.items || []).filter((l) => l.product_id === D.productId);
      inBasket = mine.reduce((a, l) => a + l.quantity, 0);
      basketQty = mine.reduce((m, l) => ({ ...m, [l.variant_id]: (m[l.variant_id] || 0) + l.quantity }), {});
    } catch (e) {
      inBasket = 0;
      basketQty = {};
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
    const ew = q('[data-email-art-wrap]');
    if (ew) ew.hidden = !!d;
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

  // Headwear: the straight-on front photo for this colour, if it is in Files.
  // Checked once per colour; the colour's own photo is used until it loads.
  // Named as Print Studio's generator names it (generate_views.py slug()).
  const slug = (v) => String(v).replace(/[^A-Za-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'x';
  function headFront(c) {
    if (!HEADWEAR || !D.filesBase || c.frontTried) return;
    c.frontTried = true;
    const name = `ai_${slug(String(D.handle).toUpperCase())}_${slug(c.name)}_FRONT.jpg`;
    const url = `${D.filesBase}${name}?width=1000`;
    const img = new Image();
    img.onload = () => {
      c.front = url;
      if (c === st.colour) refit();
    };
    img.src = url;
  }

  function render() {
    headFront(st.colour);
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
    const a = areaOf(dzs.view);
    Object.assign(it, { uid: uid(), view: dzs.view, w: a.w * 0.6, x: a.x, y: a.y + ph(a.hb, a.inch) / 2 });
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
      // Print Studio's boxes are placed on the whole photo (as on the stage).
      if (VIEW_LIST.find((x) => x.id === v).ps.length) img.style.objectFit = 'contain';
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
      if (resize) {
        const { inch } = areaOf(it.view);
        it.w = start.w + Math.max((dx * 2) / inch, ((dy * 2) / (inch * ASPECT)) * it.ratio);
      }
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
      popup(T.needPositionTitle, T.needPosition);
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
  async function artworkFiles(d) {
    if (!d) return [];
    if (d.mode === 'files') return d.files.map((f) => [f.file, f.name]);
    const out = [];
    for (const it of d.items) {
      if (it.kind === 'upload') out.push([it.file, it.name]);
      else out.push([await dataUrlToBlob(it.src), `${it.view}-text.png`]);
    }
    return out;
  }

  // Messages that need the customer to do something open as a pop-up.
  const pop = q('[data-alert]');
  let popAfter = null;
  function popup(title, text, after) {
    if (!pop) { window.alert(text); return; }
    q('[data-alert-title]', pop).textContent = title;
    q('[data-alert-text]', pop).textContent = text;
    popAfter = after || null;
    pop.showModal();
    q('[data-alert-ok]', pop).focus();
  }
  if (pop) {
    q('[data-alert-ok]', pop).addEventListener('click', () => pop.close());
    pop.addEventListener('click', (e) => { if (e.target === pop) pop.close(); });
    pop.addEventListener('close', () => { if (popAfter) popAfter(); popAfter = null; });
  }
  const goTo = (sel) => () => {
    const el = q(sel);
    if (!el) return;
    el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    const f = el.querySelector('input:not([disabled]), button');
    if (f) f.focus({ preventScroll: true });
  };
  const emailArt = q('[data-email-art]');

  // Where each design goes, for Print Studio (the _Prints property). One
  // list per artwork file, in artworkFiles() order; the links are added once
  // the files are uploaded. Worked out when Add to quote is pressed, as the
  // print area depends on the colour.
  const PS_VIEW = { front: 'Front', back: 'Back', ls: 'Left sleeve', rs: 'Right sleeve' };
  const tenth = (n) => Math.round(n * 10) / 10;
  function placements(d) {
    if (!d) return [];
    if (d.mode === 'designer') {
      return d.items.map((it) => {
        const a = areaOf(it.view);
        return [{
          view: PS_VIEW[it.view] || 'Front',
          location: VIEW_NAME[it.view],
          name: it.kind === 'text' ? `${it.view}-text.png` : it.name,
          kind: it.kind === 'text' ? 'text' : 'logo',
          text: it.kind === 'text' ? it.lines.join(' / ') : null,
          widthIn: tenth(it.w),
          topIn: tenth((box(it).top - a.y) / (a.inch * ASPECT)),
          fromCentreIn: tenth((it.x - a.x) / a.inch),
        }];
      });
    }
    // Sent files: Print Studio places them, at the width asked for if any.
    // Sleeve and back positions go on those views.
    return d.files.map((f) => POS.filter((p) => p.id in f.at).map((p) => {
      const size = sizeOf(f.at[p.id]);
      return {
        view: PS_VIEW[{ fb: 'back', ls: 'ls', rs: 'rs' }[p.id] || p.view] || 'Front',
        location: p.name,
        name: f.name,
        kind: 'logo',
        text: null,
        widthIn: typeof size === 'number' ? size : null,
        topIn: null,
        fromCentreIn: 0,
      };
    }));
  }
  // The front as the page shows it, for the basket thumbnail: the photo and
  // each front design as % of the 5:6 stage (n = its artwork file number).
  function mockOf(d) {
    if (!d || d.mode !== 'designer') return null;
    const img = photoFor('front') || st.colour.img;
    const r1 = (n) => Math.round(n * 10) / 10;
    const items = d.items.map((it, n) => ({ it, n })).filter(({ it }) => it.view === 'front' && it.src).map(({ it, n }) => {
      const b = box(it);
      return { n, l: r1(b.left), t: r1(b.top), w: r1(b.w), h: r1(b.h), r: it.rot || 0 };
    });
    return img && items.length ? { img: https(img), items } : null;
  }
  // Uploaded file links come back from /cart.js; Print Studio wants https.
  const https = (u) => (typeof u === 'string' && u.startsWith('//') ? 'https:' + u : u);
  const getCart = async () => {
    const res = await fetch(D.cartJs, { headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error(String(res.status));
    return res.json();
  };
  const postJson = (url, body) => fetch(url, {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
  });

  const msg = q('[data-add-msg]');
  const addButtons = qa('[data-add]');
  let busy = false;
  async function addToBasket() {
    if (busy) return;
    // A typed number above the stock is capped before anything is added,
    // counting what the basket already holds of that size.
    let capped = false;
    SIZES.forEach((s) => {
      const v = variantOf(s);
      if (!v || v.max == null) return;
      const room = Math.max(0, v.max - (basketQty[v.id] || 0));
      if (st.qty[s] > room) { st.qty[s] = room; capped = true; }
    });
    if (capped) sizes();
    const lines = SIZES.filter((s) => canPick(s) && st.qty[s]);
    if (!lines.length) { popup(T.needItemsTitle, T.needItems, goTo('[data-sizes]')); return; }
    const later = !st.design && emailArt && emailArt.checked;
    if (!st.design && !later) { popup(T.needDesignTitle, T.needDesign, goTo('[data-design-empty]')); return; }
    msg.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    msg.classList.remove('is-added');
    msg.textContent = T.adding;
    // One add at a time: both Add to quote buttons show "Adding…" and do
    // nothing more until this one has finished.
    busy = true;
    const labels = addButtons.map((b) => b.textContent);
    addButtons.forEach((b) => { b.disabled = true; b.textContent = T.adding; });
    const group = Date.now().toString(36);
    // Everything is read now: the colour, sizes or design may change while
    // the add is under way, and only this snapshot is used from here on.
    const rows = describe();
    const design = st.design;
    const colour = st.colour;
    const want = lines.map((size) => ({ id: colour.variants.find((x) => x.size === size).id, quantity: st.qty[size] }));
    const where = placements(design);
    const mock = mockOf(design);
    let added = false;
    let leaving = false;
    try {
      const files = await artworkFiles(design);
      // The same details go on every size of this garment.
      const props = { _group: group };
      if (!D.quoteOnly) props._buy = '1';
      if (!design) props[T.printLabel] = later ? T.emailArt : T.noDesign;
      else props[T.printLabel] = design.mode === 'designer' ? T.designedOnline : T.filesSent;
      rows.forEach((r) => {
        props[r.name] = r.text;
        if (r.detail) props[`_${r.name} ${T.placement}`] = r.detail;
      });
      if (design && design.mode === 'files' && design.note) props[T.note] = design.note;
      // The first size carries the artwork files (they need a file upload).
      const first = new FormData();
      first.append('id', want[0].id);
      first.append('quantity', want[0].quantity);
      Object.entries(props).forEach(([k, val]) => first.append(`properties[${k}]`, val));
      files.forEach(([blob, name], n) => first.append(`properties[${T.artwork} ${n + 1}]`, blob, name));
      let res = await fetch(D.cartAdd, { method: 'POST', body: first, headers: { Accept: 'application/json' } });
      if (!res.ok) throw new Error(String(res.status));
      added = true;
      // Then the uploaded links and where each design goes (_Prints) go on
      // that line and every other size, so the quote keeps the artwork
      // whichever sizes stay in the basket.
      let all = props;
      if (files.length) {
        const cart = await getCart();
        const line = cart.items.find((l) => l.properties && l.properties._group === group && l.variant_id === want[0].id);
        if (line) {
          const urls = files.map((f, n) => https(line.properties[`${T.artwork} ${n + 1}`]));
          const prints = where.flatMap((list, n) => (urls[n] ? list.map((e) => ({ ...e, url: urls[n] })) : []));
          all = { ...props };
          urls.forEach((u, n) => { if (u) all[`${T.artwork} ${n + 1}`] = u; });
          if (prints.length) all._Prints = JSON.stringify(prints);
          // The basket shows the garment with the design on it (_Mock).
          if (mock) {
            const items = mock.items.filter((m) => urls[m.n]).map(({ n, ...m }) => ({ ...m, u: urls[n] }));
            if (items.length) all._Mock = JSON.stringify({ img: mock.img, items });
          }
          res = await postJson(D.cartChange, { id: line.key, quantity: line.quantity, properties: all });
          if (!res.ok) throw new Error(String(res.status));
        }
      }
      // The other sizes together in one request.
      if (want.length > 1) {
        res = await postJson(D.cartAdd, { items: want.slice(1).map((w) => ({ ...w, properties: all })) });
        if (!res.ok) throw new Error(String(res.status));
      }
      if (!D.quoteOnly) {
        // Buy now: straight to checkout, unless quote items are also in the
        // basket (checkout takes the whole basket), then the basket page.
        msg.textContent = T.toCheckout;
        const cart = await getCart().catch(() => null);
        const onlyBuy = !!cart && cart.items.every((it) => it.properties && it.properties._buy);
        // Buttons stay disabled while the next page loads.
        leaving = true;
        window.location.href = onlyBuy ? D.checkoutUrl : D.cartUrl;
        return;
      }
      msg.innerHTML = fill(T.added, { u: D.cartUrl });
      msg.classList.add('is-added');
      // Clear the sizes so the next colour starts at 0; the meter now counts
      // what was just added from the basket.
      st.qty = {};
      sizes();
      loadBasket();
      document.dispatchEvent(new CustomEvent('cft:basket-changed'));
    } catch (e) {
      // Take out what this attempt added, so trying again does not double it.
      if (added) {
        try {
          const cart = await getCart();
          const updates = Object.fromEntries(cart.items.filter((l) => l.properties && l.properties._group === group).map((l) => [l.key, 0]));
          if (Object.keys(updates).length) await postJson(D.cartUpdate, { updates });
        } catch (e2) { /* leave it; the basket page shows what is there */ }
        loadBasket();
        document.dispatchEvent(new CustomEvent('cft:basket-changed'));
      }
      msg.textContent = '';
      popup(T.failTitle, T.addFail);
    } finally {
      if (!leaving) {
        busy = false;
        addButtons.forEach((b, i) => { b.disabled = false; b.textContent = labels[i]; });
      }
    }
  }
  addButtons.forEach((b) => b.addEventListener('click', addToBasket));

  // Phones: the bottom bar's Add to quote hides while the main Add to quote
  // box is on screen, so there is only ever one button in view.
  const mobBar = q('.mob-bar');
  const ctaBox = q('.cta-box');
  if (mobBar && ctaBox && 'IntersectionObserver' in window) {
    new IntersectionObserver(([e]) => mobBar.classList.toggle('is-off', e.isIntersecting)).observe(ctaBox);
  }

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
