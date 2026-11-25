chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.target !== "offscreen" || msg.type !== "parseLot") return false;
  try {
    const doc = new DOMParser().parseFromString(msg.html, "text/html");
    sendResponse({ ok: true, lot: parseBidCarsLot(doc, msg.vin, msg.url) });
  } catch (e) {
    sendResponse({ ok: false, error: String(e) });
  }
  return false;
});
