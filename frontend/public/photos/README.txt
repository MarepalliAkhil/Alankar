Put your own photos here, named after a slot: salon-hero, spa-hero, parlor-hero, shop-background,
salon-background, spa-background, parlor-background (page-to-photo mapping:
docs/IMAGE_SLOTS.md). Accepted: .webp, .jpg, .jpeg, .png.

A slot without its own photo shows a plain themed gradient. Nothing is drawn or generated.

Meera, the tour guide, goes in the sub-folder meera/ as meera-wave, meera-point, meera-phone,
meera-approve, meera-chat, meera-wallet, meera-stars, meera-shield and meera-celebrate
(1024 x 1280, cut-out on a transparent background is best).

Then run: npm run photos:optimize   (resizes, writes WebP, measures the photos for the tests)
and:      npm run photos:inventory  (rewrites docs/IMAGE_INVENTORY.md and docs/IMAGE_SLOTS.md)
