chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.target !== "offscreen") return false;
  try {
    if (msg.type === "parseLot") {
      const doc = new DOMParser().parseFromString(msg.html, "text/html");
      sendResponse({ ok: true, lot: parseBidCarsLot(doc, msg.vin, msg.url) });
    } else if (msg.type === "parseListing") {
      const template = document.createElement("template");
      template.innerHTML = msg.html;
      sendResponse({ ok: true, listing: LAVC_LISTING.read(template.content) });
    }
  } catch (e) {
    sendResponse({ ok: false, error: String(e) });
  }
  return false;
});
