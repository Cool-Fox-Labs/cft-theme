# Cool Fox Tees theme

The Shopify theme for Cool Fox Tees, the garment print studio at Bath Place,
Leamington Spa. Built by Cool Fox Labs on Shopify's
[Skeleton theme](https://github.com/Shopify/skeleton-theme) (MIT licence, see
`LICENSE.md`).

## How it is connected

This repository is connected to the Shopify store through Shopify's GitHub
integration (Online Store > Themes > Add theme > Connect from GitHub). Shopify
reads `main` and writes theme editor changes back to it as commits, so pull
before you push.

## What is in it

- `templates/index.liquid` - the homepage, composed from the blocks below.
- `templates/page.faq.liquid` and `templates/page.artwork-guide.liquid` - the
  FAQ and Artwork guide pages. Wording is in the locale file under `pages`. In
  Shopify admin, create a page and pick the matching template.
- `blocks/` - header, footer, hero, garment tile, showroom, bulk discount,
  how it works (with the artwork requirements pop-up) and Google reviews.
- `locales/en.default.json` - all homepage wording. Change text here.
- `config/settings_schema.json` - colours, page width and the Cool Fox Tees
  business details (address, hours, phone, email, Google rating).
- `assets/` - self-hosted fonts (Familjen Grotesk, Hanken Grotesk, IBM Plex
  Mono, all OFL), logos, Cool Fox Tees' own garment photos, `base.css` and
  `theme.js`.

## Rules

- Nothing is for sale yet: no prices, no cart, no checkout. Quotation-first.
- Never hard-code a store domain. Links use `routes.*`.
- Never put supplier (Ralawise, Uneek) imagery through an AI tool, and do not
  alter it. The homepage uses Cool Fox Tees' own photos only.
- The bulk discount tiers (10+ 5%, 20+ 10%, 40+ 15%, 50+ 20%) appear in
  `blocks/bulk-discount.liquid`, `assets/theme.js` and the locale file. Change
  all three together.

## Checks

Theme Check runs on every push (`.github/workflows/ci.yml`). Locally:
`shopify theme check`.
