const MARKET_ITEMS = [
  { label: "CAC 40", symbol: "^FCHI" },
  { label: "EURO STOXX 600", symbol: "^STOXX" },
  { label: "DAX", symbol: "^GDAXI" },
  { label: "FTSE 100", symbol: "^FTSE" },
  { label: "IBEX 35", symbol: "^IBEX" },
  { label: "AEX", symbol: "^AEX" },
  { label: "SMI", symbol: "^SSMI" },
  { label: "STOXX 50", symbol: "^STOXX50E" },
  { label: "S&P 500", symbol: "^GSPC" },
  { label: "NASDAQ", symbol: "^IXIC" },
  { label: "DOW", symbol: "^DJI" },
  { label: "Russell 2000", symbol: "^RUT" },
  { label: "NYSE Composite", symbol: "^NYA" },
  { label: "VIX", symbol: "^VIX" },
  { label: "Brent", symbol: "BZ=F" },
  { label: "WTI", symbol: "CL=F" },
  { label: "Or", symbol: "GC=F" },
  { label: "Argent", symbol: "SI=F" },
  { label: "US 10Y", symbol: "^TNX" },
  { label: "US 30Y", symbol: "^TYX" },
  { label: "FR 10Y", symbol: "^FR10Y" },
  { label: "EUR/USD", symbol: "EURUSD=X", digits: 4 },
  { label: "USD/CHF", symbol: "USDCHF=X", digits: 4 },
  { label: "USD/CNH", symbol: "USDCNH=X", digits: 4 },
  { label: "GBP/EUR", symbol: "GBPEUR=X", digits: 4 },
  { label: "GBP/USD", symbol: "GBPUSD=X", digits: 4 },
  { label: "USD/JPY", symbol: "USDJPY=X", digits: 3 },
  { label: "BTC", symbol: "BTC-USD", digits: 0 },
  { label: "ETH", symbol: "ETH-USD", digits: 0 },
];

function formatMarketValue(value) {
  if (value === null || value === undefined || value === "") return "N/D";
  if (Number.isFinite(value)) return value.toLocaleString();
  const num = Number(value);
  return Number.isFinite(num) ? num.toLocaleString() : String(value);
}

function formatWithDigits(value, digits) {
  if (!Number.isFinite(value)) return formatMarketValue(value);
  if (!Number.isFinite(digits)) return formatMarketValue(value);
  return value.toLocaleString(undefined, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function ensureTickerStyles() {
  if (document.getElementById("market-ticker-style")) return;
  const style = document.createElement("style");
  style.id = "market-ticker-style";
  style.textContent = `
    .market-ticker {
      position: relative;
      overflow: hidden;
      width: 100%;
    }
    .market-ticker-track {
      display: inline-flex;
      gap: 10px;
      padding-right: 10px;
      white-space: nowrap;
      will-change: transform;
      animation: marketTickerScroll 45s linear infinite;
    }
    .market-ticker-item {
      flex: 0 0 auto;
    }
    @keyframes marketTickerScroll {
      from { transform: translateX(-50%); }
      to { transform: translateX(0); }
    }
  `;
  document.head.appendChild(style);
}

function renderMarketStrip(container, bySymbol) {
  if (!container) return;
  ensureTickerStyles();

  const items = MARKET_ITEMS.map((item) => {
    const quote = bySymbol[item.symbol];
    let raw = quote?.price;
    if (item.invert && Number.isFinite(raw) && raw !== 0) {
      raw = 1 / raw;
    }
    const value = formatWithDigits(raw, item.digits);
    return `${item.label}: ${value}`;
  });

  container.innerHTML = "";
  container.classList.add("market-ticker");

  const track = document.createElement("div");
  track.className = "market-ticker-track";

  const buildItem = (text) => {
    const el = document.createElement("div");
    el.className = "market-item market-ticker-item";
    el.textContent = text;
    return el;
  };

  // Duplicate the sequence to create a seamless loop.
  items.forEach((text) => track.appendChild(buildItem(text)));
  items.forEach((text) => track.appendChild(buildItem(text)));

  container.appendChild(track);
}

function loadMarketStrip() {
  const container = document.getElementById("market-strip");
  if (!container) return;
  container.textContent = "Chargement marches...";

  const yahooSymbols = Array.from(
    new Set(MARKET_ITEMS.map((i) => i.symbol).filter((s) => s !== "^FR10Y"))
  );
  chrome.runtime.sendMessage(
    { type: "GET_YAHOO_QUOTES", payload: { symbols: yahooSymbols, force: false } },
    (res) => {
      if (!res?.ok) {
        container.textContent = "Marches indisponibles.";
        return;
      }
      const bySymbol = res.data?.bySymbol || {};
      chrome.runtime.sendMessage(
        { type: "GET_ECB_FR10Y", payload: { force: true } },
        (ecbRes) => {
          if (ecbRes?.ok && Number.isFinite(ecbRes.data?.value)) {
            bySymbol["^FR10Y"] = { symbol: "^FR10Y", price: ecbRes.data.value };
          }
          renderMarketStrip(container, bySymbol);
        }
      );
    }
  );
}

loadMarketStrip();
