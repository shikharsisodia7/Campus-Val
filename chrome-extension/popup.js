const DEFAULT_URL = "https://677e4389-461e-4374-a930-ec12565fc8ee-00-3kknd4ftsm5jo.picard.replit.dev";

async function getBaseUrl() {
  const { campusvalUrl } = await chrome.storage.sync.get("campusvalUrl");
  return (campusvalUrl || DEFAULT_URL).replace(/\/$/, "");
}

async function setBaseUrl(url) {
  await chrome.storage.sync.set({ campusvalUrl: url });
}

function fullUrl(base, path) {
  return `${base}${path.startsWith("/") ? path : `/${path}`}`;
}

document.addEventListener("DOMContentLoaded", async () => {
  const input = document.getElementById("url-input");
  const base = await getBaseUrl();
  input.value = base;
  input.addEventListener("change", () => {
    const v = input.value.trim().replace(/\/$/, "");
    if (v) setBaseUrl(v);
  });

  document.getElementById("open-tab").addEventListener("click", async () => {
    const b = await getBaseUrl();
    chrome.tabs.create({ url: b });
  });

  document.getElementById("open-sidepanel").addEventListener("click", async () => {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      await chrome.sidePanel.open({ tabId: tab.id });
      await chrome.sidePanel.setOptions({
        tabId: tab.id,
        path: "sidepanel.html",
        enabled: true,
      });
      window.close();
    } catch (e) {
      console.error("side panel failed", e);
    }
  });

  for (const link of document.querySelectorAll("[data-path]")) {
    link.addEventListener("click", async (e) => {
      e.preventDefault();
      const b = await getBaseUrl();
      chrome.tabs.create({ url: fullUrl(b, link.dataset.path) });
    });
  }
});
