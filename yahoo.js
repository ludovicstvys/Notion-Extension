const statusEl = document.getElementById("status");
const newsEl = document.getElementById("news");
const refreshBtn = document.getElementById("refresh");
const symbolsEl = document.getElementById("symbols");
const categoryEl = document.getElementById("category");
const regionEl = document.getElementById("region");
const langEl = document.getElementById("lang");
const quickEl = document.getElementById("quick");
const saveBtn = document.getElementById("save");
const presetsEl = document.getElementById("market-presets");

function formatDate(raw) {
  if (!raw) return "";
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return raw;
  return d.toLocaleString();
}

function renderNews(items) {
  newsEl.innerHTML = "";
  if (!items || items.length === 0) {
    statusEl.textContent = "Aucun article charge.";
    return;
  }
  statusEl.textContent = "";

  items.forEach((item) => {
    const card = document.createElement("div");
    card.className = "card article";
    card.tabIndex = 0;

    const title = document.createElement("div");
    title.className = "title";
    title.textContent = item.title || "Article";

    const meta = document.createElement("div");
    meta.className = "meta";
    meta.textContent = formatDate(item.pubDate);

    card.appendChild(title);
    if (meta.textContent) card.appendChild(meta);
    if (item.description && !quickEl.checked) {
      const desc = document.createElement("div");
      desc.className = "meta";
      desc.textContent = item.description;
      card.appendChild(desc);
    }

    newsEl.appendChild(card);

    const url = item.link;
    if (url) {
      card.addEventListener("click", () => {
        window.open(url, "_blank", "noreferrer");
      });
      card.addEventListener("keydown", (e) => {
        if (e.key === "Enter") window.open(url, "_blank", "noreferrer");
      });
    }
  });
}

function loadNews(force) {
  statusEl.textContent = "Chargement...";
  chrome.runtime.sendMessage({ type: force ? "REFRESH_YAHOO_NEWS" : "GET_YAHOO_NEWS" }, (res) => {
    if (chrome.runtime.lastError) {
      statusEl.textContent = `Erreur: ${chrome.runtime.lastError.message}`;
      return;
    }
    if (!res?.ok) {
      statusEl.textContent = `Erreur: ${res?.error || "inconnue"}`;
      return;
    }
    const items = res.data?.items || [];
    renderNews(items);
  });
}

function collectPrefs() {
  const symbols = (symbolsEl.value || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return {
    symbols: symbols.length ? symbols : ["^GSPC"],
    category: categoryEl.value || "",
    region: regionEl.value || "US",
    lang: langEl.value || "en-US",
    quickMode: !!quickEl.checked,
  };
}

function setPrefs(prefs) {
  const symbols = Array.isArray(prefs.symbols) ? prefs.symbols.join(", ") : "^GSPC";
  symbolsEl.value = symbols;
  categoryEl.value = prefs.category || "";
  regionEl.value = prefs.region || "US";
  langEl.value = prefs.lang || "en-US";
  quickEl.checked = !!prefs.quickMode;
}

function loadPrefs() {
  chrome.runtime.sendMessage({ type: "GET_YAHOO_PREFS" }, (res) => {
    if (res?.ok) {
      setPrefs(res.prefs);
    }
  });
}

const MARKET_PRESETS = [
  { label: "CAC 40", symbols: ["^FCHI"] },
  { label: "EURO STOXX 600", symbols: ["^STOXX"] },
  { label: "S&P 500", symbols: ["^GSPC"] },
  { label: "NASDAQ", symbols: ["^IXIC"] },
  { label: "DOW", symbols: ["^DJI"] },
  { label: "Brent", symbols: ["BZ=F"] },
  { label: "WTI", symbols: ["CL=F"] },
  { label: "US 10Y", symbols: ["^TNX"] },
  { label: "US 30Y", symbols: ["^TYX"] },
  { label: "FR 10Y", symbols: ["^FR10Y"] },
];

function renderPresets() {
  if (!presetsEl) return;
  presetsEl.innerHTML = "";
  MARKET_PRESETS.forEach((preset) => {
    const btn = document.createElement("button");
    btn.className = "preset";
    btn.type = "button";
    btn.textContent = preset.label;
    btn.dataset.symbols = preset.symbols.join(",");
    btn.addEventListener("click", () => {
      symbolsEl.value = preset.symbols.join(", ");
      const prefs = collectPrefs();
      chrome.runtime.sendMessage({ type: "SET_YAHOO_PREFS", payload: prefs }, () => {
        loadNews(true);
      });
    });
    presetsEl.appendChild(btn);
  });
}

function formatPrice(value) {
  if (value === null || value === undefined) return "N/D";
  if (Number.isFinite(value)) return value.toLocaleString();
  return String(value);
}

function refreshPresetQuotes(force) {
  if (!presetsEl) return;
  const symbols = Array.from(
    new Set(MARKET_PRESETS.flatMap((p) => p.symbols))
  );
  chrome.runtime.sendMessage(
    { type: "GET_YAHOO_QUOTES", payload: { symbols, force: !!force } },
    (res) => {
      if (!res?.ok) return;
      const bySymbol = res.data?.bySymbol || {};
      chrome.runtime.sendMessage(
        { type: "GET_ECB_FR10Y", payload: { force: !!force } },
        (ecbRes) => {
          if (ecbRes?.ok && Number.isFinite(ecbRes.data?.value)) {
            bySymbol["^FR10Y"] = { symbol: "^FR10Y", price: ecbRes.data.value };
          }
          const buttons = presetsEl.querySelectorAll(".preset");
          buttons.forEach((btn) => {
            const list = (btn.dataset.symbols || "").split(",").filter(Boolean);
            const first = list[0];
            const quote = first ? bySymbol[first] : null;
            const price = formatPrice(quote?.price);
            const base = btn.getAttribute("data-label") || btn.textContent.split("·")[0].trim();
            btn.setAttribute("data-label", base);
            btn.textContent = price ? `${base} · ${price}` : base;
          });
        }
      );
    }
  );
}

saveBtn.addEventListener("click", () => {
  const prefs = collectPrefs();
  chrome.runtime.sendMessage({ type: "SET_YAHOO_PREFS", payload: prefs }, () => {
    loadNews(true);
  });
});

refreshBtn.addEventListener("click", () => {
  loadNews(true);
  refreshPresetQuotes(true);
});
loadPrefs();
renderPresets();
refreshPresetQuotes(false);
loadNews(false);
