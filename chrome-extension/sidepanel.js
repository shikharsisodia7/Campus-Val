const DEFAULT_URL = "https://677e4389-461e-4374-a930-ec12565fc8ee-00-3kknd4ftsm5jo.picard.replit.dev";

(async () => {
  const { campusvalUrl } = await chrome.storage.sync.get("campusvalUrl");
  const base = (campusvalUrl || DEFAULT_URL).replace(/\/$/, "");
  document.getElementById("app").src = base;
  document.getElementById("open-tab").addEventListener("click", (e) => {
    e.preventDefault();
    chrome.tabs.create({ url: base });
  });
})();
