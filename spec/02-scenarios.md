# 02 — Usage Scenarios

Each scenario is written as **Given / When / Then**, so it doubles as a manual test case.
The reference listing is <https://www.list.am/item/24173931> (VIN `JM1GL1VM3L1522160`).

---

## Main flow

### S1. Listing with a VIN that has auction history (happy path)

**Given** the extension is installed and the user has visited bid.cars at least once in Brave
**When** the user opens `https://www.list.am/item/24173931`
**Then**
1. The page loads normally with list.am's gallery.
2. Within ~1 s, the gallery area becomes two columns: the list.am gallery on the left and a
   "bid.cars history" panel on the right with a loading indicator.
3. Within ~5 s the panel shows:
   - the 10 auction photos (main photo plus a thumbnail strip),
   - "2020 Mazda 6, Touring — Copart, lot 1-61989692, sold 2022-11-21, Trenton (NJ)",
   - "Odometer: 42,090 mi (67,738 km)", "Damage: Front end / Rear",
     "Document: Cert of title-salvage (NJ)", "Key: Missing",
   - a warning: *"Listing says 'not damaged' but the auction recorded front-end damage"*,
   - an "Open on bid.cars" link to the lot page.
4. Clicking any auction photo opens it full size in a lightbox; arrow keys move through photos.
5. The VIN tile in "Car details" gets a small green badge "Auction history found".

### S2. Same listing opened again (cache)

**Given** S1 happened less than 30 days ago
**When** the user opens the same listing (or another listing with the same VIN)
**Then** the panel appears with the photos right away, without a loading state, and shows
"checked N days ago · Re-check".

### S3. User forces a re-check

**Given** a cached result exists
**When** the user clicks "Re-check" in the panel or the toolbar popup
**Then** the cache entry is ignored, a fresh lookup runs, and the panel and cache are updated.

### S4. Browsing several listings quickly

**Given** the user opens 8 listings in background tabs within a few seconds
**When** the tabs load
**Then** lookups are queued and throttled (one per VIN, at most ~10 per minute); each tab
shows "Queued…" until its turn, and every tab ends up with the right result.

---

## Corner case 1 — the VIN is not on the list.am page

### S5. Listing without a VIN

**Given** a car listing where the seller did not fill in the VIN (no "VIN" tile under
"Car details", no "VIN-ը նշված է" label)
**When** the user opens the listing
**Then**
- the page layout is **not** changed (no empty right column),
- the toolbar icon shows a grey "–" badge, and the popup says "This listing has no VIN",
- if the "manual VIN input" setting is on, a small collapsed bar "No VIN · Enter VIN to check"
  appears under the gallery; entering a VIN runs flow S1 for that VIN.

### S6. VIN field present but invalid

**Given** the VIN tile contains something that is not a valid 17-character VIN
(e.g. `JM1GL1VM3L152216`, `-`, `chka`, or contains I/O/Q)
**When** the page loads
**Then** no bid.cars lookup is made, and the panel shows "VIN on this listing looks invalid:
`<value>`" with a "Search anyway" link to the bid.cars search page.

### S7. Non-car listing

**Given** a list.am item page from another category (apartment, phone, …)
**When** the page loads
**Then** the extension finds no VIN tile and does nothing visible (same as S5, without the
manual input bar).

---

## Corner case 2 — the VIN is not found on bid.cars

### S8. VIN has no auction record

**Given** a valid VIN that bid.cars does not know (e.g. a car bought new in Armenia/Europe)
**When** the lookup finishes
**Then**
- the right column shows a compact "No auction history found on bid.cars for `<VIN>`" card
  (it does not take the full gallery height, so the list.am gallery keeps most of the space),
- the card has a "Search manually on bid.cars" link,
- the VIN tile badge is grey "No auction history",
- the result is cached for 3 days.

> "Not found" is a useful result too: it is a good sign for the buyer, but it does **not**
> prove the car was never damaged, because other auctions and sources exist. The card says so
> in one short line.

### S9. VIN found more than once

**Given** a VIN that was auctioned twice (e.g. sold at IAAI, then relisted at Copart)
**When** the lookup finishes
**Then** the newest auction is shown, and under the summary there is
"Also auctioned: IAAI 0-12345678 (2021-03-02)" with links. Clicking one switches the
panel to that lot's photos.

---

## Failure scenarios

### S10. Cloudflare blocks the background request

**Given** the user has not visited bid.cars recently, so there is no valid Cloudflare cookie
**When** the service worker's request returns the Cloudflare challenge page (HTTP 403)
**Then** the extension uses the hidden helper tab (see
[03-vin-to-lot-resolution.md](03-vin-to-lot-resolution.md)). The user sees no difference
except that the lookup takes a few seconds longer.

### S11. Cloudflare requires a human check

**Given** Cloudflare shows an interactive challenge ("Verify you are human") in the helper tab
**When** the helper tab has not reached a lot page or results page after 15 s
**Then** the helper tab is closed and the panel shows "bid.cars asks for a human check.
[Open bid.cars] then [Retry]". After the user passes the check in a normal tab and clicks
Retry, the lookup succeeds.

### S12. bid.cars is down / offline

**Given** there is no network or bid.cars returns 5xx
**When** the lookup runs
**Then** the panel shows "Couldn't reach bid.cars" with Retry; nothing is cached.

### S13. Photos fail to load

**Given** a lot was found but the `mercury.bid.cars` images return errors when shown on list.am
**When** the panel renders
**Then** the extension retries each image through the service worker (as a blob). If that also
fails, the summary is still shown with "Photos unavailable — open on bid.cars".

### S14. list.am changed its layout

**Given** list.am changed its HTML and the VIN tile or gallery can't be found
**When** the page loads
**Then** nothing on the page is changed, one warning is logged in the console, and the popup
shows "Unsupported list.am page layout — extension needs an update".

---

## Everyday use, end to end

1. Artur browses list.am → Transport → Cars and opens a Mazda 6 listing.
2. Next to the seller's shiny photos he immediately sees auction photos of the same car with a
   smashed front end, a salvage title, and the odometer reading at auction time to compare with
   the listing's mileage.
3. He clicks through the auction photos to check which panels were damaged, then compares them
   with the listing photos on the left (paint, panel gaps, headlights).
4. He closes the tab, or calls the seller with specific questions about the repair.

No copying, no tab switching, no manual searching.
