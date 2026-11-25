# Auction detective in Codex

Ask Codex for a car’s Bid.Cars auction history. The `lookup_vin` tool uses the installed List.am VIN History
extension and returns the matching lot, damage, title type, mileage, sale date, and photo links when available.

## Setup on macOS

1. Install Node.js 22 or newer. Load the repo’s `extension/` folder as an unpacked extension in desktop Brave
   or Chrome. If it is already loaded from this checkout, reload it. Copy the extension ID from the browser’s
   extensions page with **Developer mode** on.
2. Run the following from the repo root, replacing `YOUR_EXTENSION_ID` with the ID you copied.

   ```sh
   cd mcp
   npm ci
   npm run setup -- YOUR_EXTENSION_ID
   ```

3. Add the printed settings to `~/.codex/config.toml` and restart Codex. If it already has a
   `listam-vin-history` entry, update that entry. Keep the printed timeout so the browser has time to finish.
4. Open the extension popup, choose **Connect Codex**, and allow the browser permission. Keep the browser
   open while using the tool. Choose **Connect Codex** again after restarting the browser or reloading the extension.

## Try it

> Give me the auction backstory for VIN `JM1GL1VM3L1522160`. Call out any damage and show me the auction photo links.

If Bid.Cars asks for a human check, open [Bid.Cars](https://bid.cars/) in the connected browser, complete the
check, and retry. An empty result means Bid.Cars has no matching record for that lookup. Its archive covers
only part of a car’s history.

The bridge shares the VIN and auction result with the MCP client. Browser cookies stay in the browser. Choose
**Disconnect Codex** in the popup to close the local connection. To remove the setup, remove the MCP entry
from Codex and delete `io.github.mysticcode99.listam_vin_history.json` from
`~/Library/Application Support/Google/Chrome/NativeMessagingHosts/`. The local launcher lives in
`~/.listam-vin-history/`.

## Verify locally

Run `npm test` in `mcp/`. The tests use a simulated browser and never query the auction site.
