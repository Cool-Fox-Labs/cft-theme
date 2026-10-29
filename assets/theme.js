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
