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
 * Basket page: "Send quote request" posts the basket and the customer's
 * contact details to the quote request address (Print Studio, through the
 * app proxy), where it is filed as "Quote requested".
 */
(() => {
  const button = document.querySelector('[data-send-quote]');
  if (!button) return;
  const msg = document.querySelector('[data-quote-msg]');
  const val = (n) => (document.querySelector(`[name="${n}"]`) || {}).value?.trim() || '';
  button.addEventListener('click', async () => {
    const contact = { name: val('q_name'), email: val('q_email'), phone: val('q_phone') };
    if (!contact.name || !(contact.email || contact.phone)) { msg.textContent = msg.dataset.need; return; }
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
        body: JSON.stringify({ source: 'basket', contact, note: cart.note || '', cart: { ...cart, items } }),
      });
      if (!res.ok) throw new Error(String(res.status));
      msg.textContent = msg.dataset.ok;
      button.hidden = true;
      if (items.length === cart.items.length) {
        await fetch(form.action + '/clear.js', { method: 'POST' });
      } else {
        const updates = Object.fromEntries(items.map((it) => [it.key, 0]));
        await fetch(form.action + '/update.js', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ updates }) });
        setTimeout(() => window.location.reload(), 2500);
      }
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
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = new FormData(form);
    const name = String(data.get('name') || '').trim();
    if (!name || !(String(data.get('email') || '').trim() || String(data.get('phone') || '').trim())) { msg.textContent = msg.dataset.need; return; }
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
      msg.textContent = msg.dataset.ok;
      form.replaceChildren(msg);
    } catch (err) {
      msg.textContent = msg.dataset.fail;
      button.disabled = false;
    }
  });
})();
