# List.am VIN History — Browser Extension Spec

## Purpose

Used-car listings on [list.am](https://www.list.am/) often show the car's VIN, but
not what happened to the car before it was sold in Armenia. A large share of these
cars are imported from US insurance auctions (Copart, IAAI) after an accident, and
[bid.cars](https://bid.cars/) keeps an archive of those auctions, including the
**auction photos taken before the car was repaired**.

Today the manual flow is:

1. Open a car listing on list.am.
2. Copy the VIN.
3. Open bid.cars, paste the VIN into search.
4. bid.cars redirects to the lot page (if the car was ever auctioned).
5. Compare the auction photos with the listing photos by switching tabs.

The extension automates steps 2–5. When a list.am car listing is opened, it reads
the VIN, finds the bid.cars lot, and shows the auction photos and key auction facts
**side by side** with the listing photos on the same page.

## Target environment

- Browser: Brave (Chromium-based), so Chrome / Edge work too.
- Extension platform: Chrome Extensions **Manifest V3**.
- Personal use first; no backend server, no accounts, no paid APIs.

## Documents in this folder

| File | What it covers |
| --- | --- |
| [01-spec.md](01-spec.md) | Functional and non-functional requirements, architecture, permissions, data model |
| [02-scenarios.md](02-scenarios.md) | How the extension is used, step by step, including the corner cases |
| [03-vin-to-lot-resolution.md](03-vin-to-lot-resolution.md) | Task 2: how to get from a VIN to a bid.cars lot page without knowing the lot number |
| [04-ui-redesign.md](04-ui-redesign.md) | Task 3: the side-by-side photo layout on the list.am page |
| [05-dom-reference.md](05-dom-reference.md) | Exact selectors and data locations found in the saved example pages |

## Reference example

| | |
| --- | --- |
| list.am listing | <https://www.list.am/item/24173931> (Mazda 6, 2020) |
| VIN | `JM1GL1VM3L1522160` |
| bid.cars lot | <https://bid.cars/en/lot/1-61989692/2020-Mazda-6-JM1GL1VM3L1522160> |
| Saved pages | [`../list_page.html`](../list_page.html), [`../bid_cars.html`](../bid_cars.html) |

The auction record shows the car was sold at Copart (Trenton, NJ) on 2022-11-21
with front-end and rear damage, a salvage title and 42,090 mi. The list.am listing
says "Չվթարված" (not damaged) and 113,000 km. Catching mismatches like this is the
reason the extension exists.
