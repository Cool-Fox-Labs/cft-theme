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
    head.querySelectorAll('.panel a, .drawer a').forEach((link) =>
      link.addEventListener('click', () => {
        closeAll(null);
        setDrawer(false);
      })
    );
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

  // Published bulk discount: 10+ 5%, 20+ 10%, 40+ 15%, 50+ 20%.
  const rate = (quantity) => (quantity >= 50 ? 20 : quantity >= 40 ? 15 : quantity >= 20 ? 10 : quantity >= 10 ? 5 : 0);
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
 * Header "Your quote (n)": shows and updates as soon as something is added,
 * without a page refresh.
 */
document.addEventListener('cft:basket-changed', async () => {
  const link = document.querySelector('[data-basket-link]');
  if (!link) return;
  try {
    const cart = await (await fetch(link.dataset.cartJs)).json();
    link.querySelector('[data-basket-count]').textContent = cart.item_count;
    link.hidden = !cart.item_count;
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
          cart: { ...cart, items },
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
