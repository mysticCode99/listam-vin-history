# 05 — DOM Reference

Selectors and data locations taken from the saved pages
[`../list_page.html`](../list_page.html) and [`../bid_cars.html`](../bid_cars.html)
(saved 2026-11-24). Keep all of these in one config module (NFR-6).

## list.am item page

### VIN

The class chain given in the task (`p.te13.fw-medium.fs-sm…attr-value`) is shared by **every**
attribute value (make, mileage, colour, …), so it can't identify the VIN by itself. Find the
tile by its icon or by its label instead:

```html
<div class="at3">
  <div class="attr-icon" style="background-image: url(/img/redesign/icons/attributes/post/vin-icon.png?v2)"></div>
  <div class="bo69 attr-info-wraper">
    <p class="te13 fw-medium fs-sm lh-sm align-left text-primary ellipsis attr-value nowrap one-line">JM1GL1VM3L1522160</p>
    <p class="te13 fw-medium fs-xxs lh-xxs align-left text-light-grey ellipsis nowrap one-line">VIN</p>
  </div>
</div>
```

```js
const VIN_RE = /^[A-HJ-NPR-Z0-9]{17}$/;

function findVin(doc = document) {
  // 1. By icon (language independent)
  const icon = doc.querySelector('.at3 .attr-icon[style*="vin-icon"]');
  let value = icon?.closest(".at3")?.querySelector(".attr-value")?.textContent;

  // 2. By label text "VIN" (same in hy / ru / en)
  if (!value) {
    for (const label of doc.querySelectorAll(".at3 .attr-info-wraper p:not(.attr-value)")) {
      if (label.textContent.trim().toUpperCase() === "VIN") {
        value = label.parentElement.querySelector(".attr-value")?.textContent;
        break;
      }
    }
  }
  if (!value) return { status: "no_vin" };

  const vin = value.replace(/\s+/g, "").toUpperCase();
  return VIN_RE.test(vin) ? { status: "ok", vin } : { status: "invalid_vin", raw: value.trim() };
}
```

Quick pre-check: listings with a VIN also show a label
`<div class="po107" data-post-labels="1"><span class="ve28">VIN-ը նշված է</span></div>`
("VIN is specified"). Its text is translated per language, so use it only as a hint.

### Photo gallery

```html
<div class="vit">
  <div class="po145" id="po145" data-testid="listing-image-gallery" tabindex="1">
    <div class="p"><div>
      <img src="//img.list.am/f/006/101340006.webp" alt="Mazda 6, 2.5 լ," itemprop="image"
           data-testid="listing-gallery-image-0">
    </div></div>
  </div>
</div>
```

Only the first photo is in the HTML; the full list is passed to list.am's slider in an inline
script:

```js
po145.init('#po145', {img:["//img.list.am/f/006/101340006.webp","//img.list.am/f/007/101340007.webp", …]});
```

```js
function listamPhotos(doc = document) {
  for (const s of doc.scripts) {
    const m = s.textContent.match(/po145\.init\(\s*'#po145'\s*,\s*\{\s*img\s*:\s*(\[[^\]]*\])/);
    if (m) return JSON.parse(m[1]).map(u => (u.startsWith("//") ? "https:" + u : u));
  }
  return [...doc.querySelectorAll("#po145 img[src]")].map(i => i.src);
}
```

| What | Selector |
| --- | --- |
| Gallery wrapper (insert split around this) | `#pcontent .vi > .vit` |
| Gallery component | `[data-testid="listing-image-gallery"]`. The id is `#po145` in the saved page and `#po147` on the live site, so don't select by id. The photo list regex is `/po\d+\.init\(\s*'#po\d+'\s*,\s*\{\s*img\s*:\s*(\[[^\]]*\])/` |
| Page grid | `#main .pmain` (grid `740px 360px`): content column + `#pmenu` (title, price, seller) |
| Save heart | `#sstar`, absolutely positioned in `#main` (top 44px, right 0) |
| Title | `.vi h1[itemprop="name"]` — "Mazda 6, 2.5 լ, 2020 թ." |
| Price | `[data-testid="post-view-price"]` (attribute `content="16000"`) |
| Mileage | `.at3` with icon `mileage.png` → `.attr-value` — "113,000 կմ" |
| Condition | `.at3` with icon `general-condition-new.png` → `.attr-value` — "Չվթարված" (not damaged) |
| Listing id | `/item/(\d+)` in `location.pathname` |

### Language variants

`hreflang` links in the page: `https://www.list.am/item/{id}` (hy), `/ru/item/{id}`, `/en/item/{id}`.
Icons, `data-testid` attributes and the "VIN" label are the same in all three.

## bid.cars lot page

URL: `https://bid.cars/en/lot/{lotId}/{year}-{Make}-{Model}-{VIN}`

### Identity — JSON-LD

```js
function lotJsonLd(doc) {
  for (const s of doc.querySelectorAll('script[type="application/ld+json"]')) {
    try {
      const data = JSON.parse(s.textContent);
      if (data["@type"] === "Vehicle") return data;
    } catch {}
  }
  return null;
}
```

Example (abridged) from the reference lot:

```json
{
  "@type": "Vehicle",
  "url": "https://bid.cars/en/lot/1-61989692/2020-Mazda-6-JM1GL1VM3L1522160",
  "name": "2020 Mazda 6, Touring | JM1GL1VM3L1522160 | Bid History | BidCars",
  "description": "2020 Mazda 6, Touring ✔️ VIN: JM1GL1VM3L1522160 Lot: 1-61989692, Sale date: 2022-11-21 ➡️ Location: Trenton (NJ), USA | Odometer: 42 090 mi",
  "manufacturer": "Mazda",
  "model": "6",
  "vehicleIdentificationNumber": "JM1GL1VM3L1522160",
  "productionDate": "2020",
  "color": "Charcoal",
  "vehicleTransmission": "Automatic",
  "knownVehicleDamages": "Front end",
  "purchaseDate": "2022-11-21"
}
```

Odometer and location are only in `description`:
`/Odometer:\s*([\d\s]+)\s*mi/` and `/Location:\s*([^,|]+)/`.

### Photos

```html
<div id="productContainer">
  <div class="f-carousel__slide"
       data-thumb-src="https://mercury.bid.cars/1-61989692/2020-Mazda-6-JM1GL1VM3L1522160-1.jpg"
       data-fancybox="gallery"
       data-src="https://mercury.bid.cars/1-61989692/2020-Mazda-6-JM1GL1VM3L1522160-1.jpg">
    <img src="…-1.jpg" alt="JM1GL1VM3L1522160 2020 Mazda 6 photo no. 1"/>
  </div>
  …  (10 slides for the reference lot)
</div>
```

```js
const photos = [...doc.querySelectorAll("#productContainer .f-carousel__slide[data-src]")]
  .map(el => el.dataset.src);
```

Caution: the page also contains thumbnails of **other** cars ("Similar archival offers"),
also on `mercury.bid.cars`. Never collect all `mercury.bid.cars` images on the page. If the
selector above fails, only accept URLs that start with `https://mercury.bid.cars/{lotId}/`.

Active (not yet sold) lots may serve photos from `images.bid.cars` instead of `mercury.bid.cars`.

### Other fields

| Field | Where | Reference value |
| --- | --- | --- |
| Canonical URL | `meta[property="og:url"]` | `…/en/lot/1-61989692/2020-Mazda-6-JM1GL1VM3L1522160` |
| Cover image | `meta[property="og:image"]` | `https://mercury.bid.cars/1-61989692/…-1.jpg` |
| Page title | `<title>` | `2020 Mazda 6, Touring \| JM1GL1VM3L1522160 \| Bid History \| BidCars` |
| Archived flag | inline `var isArchived = 1;` / `#archieved-message` | "Auction ended on Monday, November 21, 2022." |
| Location / Seller / Sale Document | text rows "Location:", "Seller:", "Sale Document:" in `.right-side` | Trenton (NJ) / Insurance Company / Cert of title-salvage (NJ) |
| Primary / Secondary damage | label "Primary damage" / "Secondary damage" → next value | Front end / Rear |
| Key / Start code | label "Key" / "Start code" → next value | Missing / No information |
| Sales history | section "Sales History": rows of Auction, Date, Lot #, Final bid (masked `******`), Odometer, Status, Seller | Copart, 2022-11-21, 1-61989692, ******, 42 090 mi, Sold, Insurance company |

For label/value rows, match by label text rather than class names (bid.cars class names are
generic: `.option`, `.right-info`). The page is in English when using the `/en/` URL prefix,
so always request `/en/` URLs.

### Endpoints seen in the page

| URL | Use |
| --- | --- |
| `https://bid.cars/en/search/results?search-type=typing&query={q}` | Site search (JSON-LD `SearchAction`); redirects to the lot when the VIN matches |
| `https://bid.cars/app/search/request?…` | JSON search, current auctions |
| `https://bid.cars/app/search/archived/request?…` | JSON search, archived auctions |
| `https://bid.cars/app/lot/{lotId}/images` | ZIP of all lot photos |
