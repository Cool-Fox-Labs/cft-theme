/**
 * Cool Fox Tees storefront behaviour: header drop-downs, the phone menu
 * drawer, the artwork requirements dialog and the bulk discount slider.
 * Each part does nothing if its markup is not on the page.
 */
(() => {
  const head = document.getElementById('site-head');
  if (head) {
    const tops = [...head.querySelectorAll('.nav button.top')];
    const panelFor = (button) => document.getElementById(button.getAttribute('aria-controls'));
    const closeAll = (except) =>
      tops.forEach((button) => {
        if (button === except) return;
        button.setAttribute('aria-expanded', 'false');
        panelFor(button).hidden = true;
      });

    tops.forEach((button) =>
      button.addEventListener('click', () => {
        const open = button.getAttribute('aria-expanded') === 'true';
        closeAll(button);
        button.setAttribute('aria-expanded', open ? 'false' : 'true');
        panelFor(button).hidden = open;
      })
    );

    const menuButton = document.getElementById('menu-btn');
    const drawer = document.getElementById('drawer');
    const setDrawer = (open) => {
      if (!menuButton || !drawer) return;
      menuButton.setAttribute('aria-expanded', open ? 'true' : 'false');
      menuButton.textContent = open ? menuButton.dataset.openLabel : menuButton.dataset.closedLabel;
      drawer.hidden = !open;
    };
    menuButton?.addEventListener('click', () => setDrawer(menuButton.getAttribute('aria-expanded') !== 'true'));

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') closeAll(null);
    });
    document.addEventListener('click', (event) => {
      if (!head.contains(event.target)) closeAll(null);
    });
    head.addEventListener('click', (event) => {
      if (!event.target.closest('.panel a, .drawer a')) return;
      closeAll(null);
      setDrawer(false);
    });

    // Desktop Garments drop-down: the photo menu is its own small page,
    // fetched once after load on wide screens (phones use the drawer and
    // never need it). Keeps that work off every page load.
    const mega = head.querySelector('[data-mega]');
    if (mega && window.matchMedia('(min-width: 961px)').matches) {
      let loaded = false;
      const load = async () => {
        if (loaded) return;
        loaded = true;
        try {
          const res = await fetch(mega.dataset.megaUrl);
          if (!res.ok) throw new Error(String(res.status));
          const html = (await res.text()).trim();
          if (html.includes('class="mega')) mega.innerHTML = html;
        } catch (e) {
          loaded = false; // keep the plain list; try again on the next open
        }
      };
      tops[0]?.addEventListener('pointerenter', load, { once: true });
      tops[0]?.addEventListener('focus', load, { once: true });
      if ('requestIdleCallback' in window) requestIdleCallback(load, { timeout: 3000 });
      else setTimeout(load, 1500);
    }
  }

  document.querySelectorAll('[data-dialog-open]').forEach((opener) => {
    const dialog = document.getElementById(opener.dataset.dialogOpen);
    if (!(dialog instanceof HTMLDialogElement)) return;
    opener.addEventListener('click', () => dialog.showModal());
    dialog.querySelectorAll('[data-dialog-close]').forEach((closer) => closer.addEventListener('click', () => dialog.close()));
    dialog.addEventListener('click', (event) => {
      if (event.target === dialog) dialog.close();
    });
  });

  // Published bulk discount: 10+ 10%, 25+ 20%, 50+ 25%, 100+ 30%.
  const rate = (quantity) => (quantity >= 100 ? 30 : quantity >= 50 ? 25 : quantity >= 25 ? 20 : quantity >= 10 ? 10 : 0);
  document.querySelectorAll('[data-bulk]').forEach((card) => {
    const range = card.querySelector('[data-bulk-range]');
    const count = card.querySelector('[data-bulk-count]');
    const output = card.querySelector('[data-bulk-output]');
    const tiers = [...card.querySelectorAll('.tiers [data-min]')];
    if (!range || !count || !output) return;
    const update = () => {
      const quantity = Number(range.value);
      count.textContent = String(quantity);
      output.textContent = `${rate(quantity)}%`;
      let active = 0;
      tiers.forEach((tier, index) => {
        if (quantity >= Number(tier.dataset.min)) active = index;
      });
      tiers.forEach((tier, index) => tier.classList.toggle('on', index === active));
    };
    range.addEventListener('input', update);
    update();
  });
})();

/**
 * After a quote request: a short summary is kept in sessionStorage so the
 * "Quote request sent" view (/pages/get-a-quote#sent) can show it.
 */
function saveSent(summary) {
  try { sessionStorage.setItem('cft-quote-sent', JSON.stringify(summary)); } catch (e) { /* private mode */ }
}
function showSent() {
  const view = document.querySelector('[data-quote-sent]');
  if (!view) return;
  const start = document.querySelector('[data-quote-start]');
  if (start) start.hidden = true;
  view.hidden = false;
  let s = null;
  try { s = JSON.parse(sessionStorage.getItem('cft-quote-sent') || 'null'); } catch (e) { s = null; }
  const title = view.querySelector('[data-sent-title]');
  if (s && s.name) title.textContent = title.dataset.named.replace('%n', s.name.split(' ')[0]);
  const box = view.querySelector('[data-sent-summary]');
  const list = view.querySelector('[data-sent-list]');
  const L = JSON.parse(view.querySelector('[data-sent-labels]')?.textContent || '{}');
  const rows = [];
  if (s) {
    if (s.contact) rows.push([L.contact, s.contact]);
    (s.items || []).forEach((t, i) => rows.push([i === 0 ? L.items : '', t]));
    if (s.garment) rows.push([L.garment, s.garment]);
    if (s.quantity) rows.push([L.quantity, s.quantity]);
    if (s.neededBy) rows.push([L.neededBy, new Date(s.neededBy).toLocaleDateString('en-GB')]);
    if (s.files) rows.push([L.files, String(s.files)]);
  }
  list.replaceChildren(...rows.flatMap(([k, v]) => {
    const dt = document.createElement('dt'); dt.textContent = k;
    const dd = document.createElement('dd'); dd.textContent = v;
    return [dt, dd];
  }));
  box.hidden = !rows.length;
  window.scrollTo(0, 0);
  title.focus({ preventScroll: true });
}
if (window.location.hash === '#sent') showSent();

/**
 * Header "Your quote (n)" / "Basket (n)": shows and updates as soon as something is added,
 * without a page refresh.
 */
document.addEventListener('cft:basket-changed', async () => {
  const link = document.querySelector('[data-basket-link]');
  if (!link) return;
  try {
    const cart = await (await fetch(link.dataset.cartJs)).json();
    // The header link and the phone drawer's "Your quote (n)".
    document.querySelectorAll('[data-basket-count]').forEach((el) => { el.textContent = cart.item_count; });
    // "Basket" once a Buy now item (quick tee) is in, else "Your quote".
    const buy = cart.items.some((i) => (i.properties && i.properties._buy === '1') || i.handle === 'back-print');
    document.querySelectorAll('[data-basket-label]').forEach((el) => { el.textContent = buy ? el.dataset.buy : el.dataset.quote; });
    link.hidden = !cart.item_count;
    link.dataset.count = cart.item_count;
  } catch (e) { /* leave as it is */ }
});

/**
 * Basket page: "Send quote request" posts the basket and the customer's
 * contact details to the quote request address (Print Studio, through the
 * app proxy), where it is filed as "Quote requested".
 */
(() => {
  const button = document.querySelector('[data-send-quote]');
  if (!button) return;
  const msg = document.querySelector('[data-quote-msg]');
  const val = (n) => (document.querySelector(`[name="${n}"]`) || {}).value?.trim() || '';
  // Collection or delivery: the address boxes only show for delivery.
  const ship = document.querySelector('[data-quote-ship]');
  const addr = document.querySelector('[data-ship-addr]');
  const shipping = () => (document.querySelector('[name="q_ship"]:checked') || {}).value || 'collect';
  ship?.addEventListener('change', () => { if (addr) addr.hidden = shipping() !== 'deliver'; });
  if (addr) addr.hidden = shipping() !== 'deliver';
  const stop = (text, field) => {
    msg.textContent = text;
    const el = field && document.querySelector(`[name="${field}"]`);
    if (el) el.focus();
  };
  // Enter (Go on a phone) in a contact or address box would submit the
  // basket form through its first button, Update, reloading the page and
  // losing what was typed. It sends the quote request instead.
  document.querySelectorAll('[data-quote-contact] input, [data-quote-ship] input').forEach((input) => {
    input.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      if (!button.disabled) button.click();
    });
  });
  // Only what Print Studio reads from each line, to keep the request small.
  const slim = (it) => ({
    key: it.key, product_id: it.product_id, variant_id: it.variant_id, quantity: it.quantity, properties: it.properties,
    options_with_values: it.options_with_values, product_title: it.product_title, title: it.title, sku: it.sku,
  });
  button.addEventListener('click', async () => {
    const contact = { name: val('q_name'), email: val('q_email'), phone: val('q_phone'), company: val('q_company') };
    if (!contact.name) return stop(msg.dataset.need, 'q_name');
    if (!contact.email) return stop(msg.dataset.need, 'q_email');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact.email)) return stop(msg.dataset.needEmail, 'q_email');
    if (!contact.phone) return stop(msg.dataset.need, 'q_phone');
    const method = shipping();
    const address = method === 'deliver'
      ? { address1: val('q_address1'), address2: val('q_address2'), city: val('q_city'), zip: val('q_postcode'), countryCode: 'GB' }
      : null;
    if (address) {
      for (const f of ['q_address1', 'q_city', 'q_postcode']) if (!val(f)) return stop(msg.dataset.needAddress, f);
    }
    msg.textContent = '';
    button.disabled = true;
    try {
      const form = button.closest('form');
      await fetch(form.action + '/update.js', { method: 'POST', body: new FormData(form) });
      const cart = await (await fetch(form.action + '.js')).json();
      // Only the quote items are sent; buy-now items stay for checkout.
      const keys = [...document.querySelectorAll('[data-quote-key]')].map((li) => li.dataset.quoteKey);
      const items = cart.items.filter((it) => keys.includes(it.key));
      const res = await fetch(button.dataset.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          source: 'basket', contact,
          delivery: { method, address },
          note: cart.note || '',
          cart: { note: cart.note || '', item_count: cart.item_count, items: items.map(slim) },
        }),
      });
      if (!res.ok) throw new Error(String(res.status));
      // Remove what was sent: everything, or just the quote items when
      // buy-now items stay behind for checkout.
      if (items.length === cart.items.length) {
        await fetch(form.action + '/clear.js', { method: 'POST' });
      } else {
        const updates = Object.fromEntries(items.map((it) => [it.key, 0]));
        await fetch(form.action + '/update.js', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ updates }) });
      }
      button.textContent = button.dataset.sentLabel;
      saveSent({
        name: contact.name,
        contact: contact.email || contact.phone,
        items: items.map((it) => `${it.quantity} × ${it.product_title}${it.variant_title ? ` (${it.variant_title})` : ''}`),
      });
      if (button.dataset.sentUrl && items.length === cart.items.length) { window.location.href = button.dataset.sentUrl; return; }
      msg.textContent = msg.dataset.ok;
      if (items.length !== cart.items.length) setTimeout(() => window.location.reload(), 2500);
    } catch (e) {
      msg.textContent = msg.dataset.fail;
      button.disabled = false;
    }
  });
})();

/**
 * Get a quote page: the "tell us what you need" form posts its fields and
 * any artwork files to the same quote request address.
 */
(() => {
  const form = document.querySelector('[data-quote-form]');
  if (!form) return;
  const msg = form.querySelector('[data-quote-form-msg]');
  const addr = form.querySelector('[data-ship-addr]');
  const shipping = () => (form.querySelector('[name="ship"]:checked') || {}).value || 'collect';
  form.querySelector('[data-quote-ship]')?.addEventListener('change', () => { if (addr) addr.hidden = shipping() !== 'deliver'; });
  if (addr) addr.hidden = shipping() !== 'deliver';
  // Earliest "needed by" date: N working days from today (weekends skipped).
  const dateIn = form.querySelector('[name="needed_by"]');
  let earliest = '';
  if (dateIn) {
    const d = new Date();
    let left = Number(dateIn.dataset.minDays || 0);
    while (left > 0) { d.setDate(d.getDate() + 1); if (d.getDay() % 6) left -= 1; }
    earliest = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    dateIn.min = earliest;
  }
  const stop = (text, field) => {
    msg.textContent = text;
    const el = field && form.querySelector(`[name="${field}"]`);
    if (el) el.focus();
  };
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = new FormData(form);
    const v = (n) => String(data.get(n) || '').trim();
    const d = msg.dataset;
    const name = v('name');
    if (!v('garment')) return stop(d.needGarment, 'garment');
    if (v('needed_by') && earliest && v('needed_by') < earliest) return stop(d.needDate, 'needed_by');
    if (!name) return stop(d.need, 'name');
    if (!v('email')) return stop(d.need, 'email');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v('email'))) return stop(d.needEmail, 'email');
    if (!v('phone')) return stop(d.need, 'phone');
    const deliver = shipping() === 'deliver';
    if (deliver) for (const f of ['address1', 'city', 'zip']) if (!v(f)) return stop(d.needAddress, f);
    // Budget, company and collection or delivery also go into the notes, so
    // they reach the quote whatever Print Studio reads from the form.
    const extra = [];
    if (v('budget')) extra.push(`${d.lBudget || 'Budget'}: ${v('budget')}`);
    if (v('company')) extra.push(`${d.lCompany || 'Company'}: ${v('company')}`);
    extra.push(deliver
      ? `${d.lDeliver || 'Delivery to'}: ${['address1', 'address2', 'city', 'zip'].map(v).filter(Boolean).join(', ')}`
      : d.lCollect || 'Collection from the showroom');
    data.set('notes', [v('notes'), ...extra].filter(Boolean).join('\n'));
    if (!deliver) ['address1', 'address2', 'city', 'zip'].forEach((f) => data.delete(f));
    const files = data.getAll('files[]').filter((f) => f && f.size);
    if (files.length > 5 || files.reduce((n, f) => n + f.size, 0) > 10 * 1024 * 1024) { msg.textContent = msg.dataset.big; return; }
    const button = form.querySelector('button[type="submit"]');
    button.disabled = true;
    msg.textContent = msg.dataset.sending;
    try {
      const res = await fetch(form.action, { method: 'POST', body: data, headers: { Accept: 'application/json' } });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        if (j.error && res.status < 500) { msg.textContent = j.error; button.disabled = false; return; }
        throw new Error(String(res.status));
      }
      saveSent({
        name,
        contact: v('email'),
        garment: String(data.get('garment') || '').trim(),
        quantity: String(data.get('quantity') || '').trim(),
        neededBy: String(data.get('needed_by') || '').trim(),
        files: files.length,
      });
      window.location.hash = 'sent';
      showSent();
    } catch (err) {
      msg.textContent = msg.dataset.fail;
      button.disabled = false;
    }
  });
})();

// Basket thumbnails for designs made online: the garment photo with each
// front design placed as on the product page (the line's _Mock property).
document.querySelectorAll('[data-mock]').forEach((box) => {
  let m;
  // Shopify can print the property with a stray "http://" in front, so
  // read from the first "{".
  const raw = box.dataset.mock || '';
  try { m = JSON.parse(raw.slice(raw.indexOf('{'))); } catch (e) { return; }
  if (!m || !m.img || !Array.isArray(m.items)) return;
  const photo = box.querySelector('img') || document.createElement('img');
  photo.removeAttribute('srcset');
  photo.src = m.img;
  photo.alt = '';
  box.prepend(photo);
  m.items.forEach((it) => {
    if (!it.u) return;
    const d = document.createElement('img');
    d.className = 'mock-d';
    d.src = it.u;
    d.alt = '';
    d.loading = 'lazy';
    d.style.cssText = `left:${it.l}%;top:${it.t}%;width:${it.w}%;height:${it.h}%`;
    if (it.r) d.style.transform = `rotate(${it.r}deg)`;
    box.append(d);
  });
});

/* Category page filters: show only the cards in the chosen group. */
(() => {
  const bar = document.querySelector('[data-coll-filter]');
  if (!bar) return;
  const buttons = [...bar.querySelectorAll('[data-filter]')];
  if (!buttons.length) return;
  const items = [...document.querySelectorAll('.coll-item')];
  const count = bar.querySelector('.coll-count');
  const apply = (key) => {
    let shown = 0;
    items.forEach((item) => {
      const on = !key || (item.dataset.groups || '').split(' ').includes(key);
      item.hidden = !on;
      if (on) shown += 1;
    });
    buttons.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.filter === key)));
    if (count) count.textContent = shown === 1 ? count.dataset.countOne : count.dataset.count.replace('%n', shown);
  };
  buttons.forEach((b) => b.addEventListener('click', () => {
    apply(b.dataset.filter);
    try { history.replaceState(null, '', b.dataset.filter ? '#' + b.dataset.filter : location.pathname + location.search); } catch (e) {}
  }));
  const fromHash = () => {
    const key = decodeURIComponent(location.hash.slice(1));
    if (key && buttons.some((b) => b.dataset.filter === key)) apply(key);
  };
  fromHash();
  /* The Garments menu links here as #<group>; follow it when already on the page. */
  window.addEventListener('hashchange', fromHash);
})();

/**
 * Basket page: a back print add-on always matches the number of tees it
 * belongs to (same _group). Typing a new tee quantity updates it before the
 * form is sent; if it is ever out of step on load (a tee removed, say), it
 * is put right and the page reloads.
 */
(() => {
  const backs = [...document.querySelectorAll('[data-back-group]')];
  if (!backs.length) return;
  const sync = () => backs.forEach((b) => {
    const n = [...document.querySelectorAll(`[data-group="${CSS.escape(b.dataset.backGroup)}"]`)]
      .reduce((a, i) => a + Math.max(0, parseInt(i.value, 10) || 0), 0);
    b.value = n;
    const show = b.closest('.basket-qty').querySelector('[data-back-show]');
    if (show) show.textContent = n;
  });
  document.querySelectorAll('[data-group]').forEach((i) => i.addEventListener('input', sync));
  const form = document.querySelector('[data-basket]');
  if (form) form.addEventListener('submit', sync);
  const fix = backs.filter((b) => b.dataset.backFix);
  // Only once per page visit, so a failed fix can never loop.
  let tried = false;
  try { tried = sessionStorage.getItem('cft-back-fix') === location.href; sessionStorage.removeItem('cft-back-fix'); } catch (e) { /* no storage */ }
  if (fix.length && !tried) {
    const updates = Object.fromEntries(fix.map((b) => [b.dataset.backFix, parseInt(b.dataset.backWant, 10) || 0]));
    try { sessionStorage.setItem('cft-back-fix', location.href); } catch (e) { /* no storage */ }
    fetch(fix[0].dataset.updateUrl, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify({ updates }) })
      .then((r) => { if (r.ok) window.location.reload(); })
      .catch(() => {});
  }
})();
