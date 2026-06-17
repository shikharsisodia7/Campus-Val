// Service worker: enable the side panel on action click as a fallback,
// and set sensible defaults on install.
chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel
    .setPanelBehavior({ openPanelOnActionClick: false })
    .catch(() => {});
});
