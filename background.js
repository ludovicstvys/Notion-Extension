const NOTION_VERSION = "2022-06-28";
const MAX_LIST_ROWS = 200;
const GCAL_BASE = "https://www.googleapis.com/calendar/v3";
const GCAL_EVENTS_MAX = 250;
const GCAL_NOTIFY_MINUTES = 30;
const GCAL_ALARM_PREFIX = "gcal|";
const GCAL_SYNC_ALARM = "gcal-sync";
const GCAL_NOTIFY_TOGGLE_KEY = "gcalNotifyCalendars";
const GCAL_NOTIFIED_KEY = "gcalNotified";
const GCAL_NOTIFY_WINDOW_MIN = 10;
const GCAL_CACHE_KEY = "gcalEventCache";
const GCAL_CACHE_TTL_MS = 5 * 60 * 1000;
const YAHOO_NEWS_ALARM = "yahoo-news-sync";
const YAHOO_NEWS_URL = "https://feeds.finance.yahoo.com/rss/2.0/headline";
const YAHOO_NEWS_CACHE_MIN = 15;
const TAG_RULES_KEY = "autoTagRules";
const NOTION_SYNC_ALARM = "notion-calendar-sync";
const NOTION_SYNC_KEY = "notionCalendarSyncEnabled";
const NOTION_SYNC_MAP = "notionCalendarMap";
const DEADLINE_PREFS_KEY = "deadlinePrefs";
const DEADLINE_ALARM_PREFIX = "deadline|";
const OFFLINE_QUEUE_KEY = "offlineQueue";
const YAHOO_CHART_URL = "https://query1.finance.yahoo.com/v8/finance/chart";
const YAHOO_QUOTE_CACHE_MIN = 5;
const ECB_FR10Y_URL =
  "https://webstat.banque-france.fr/api/explore/v2.1/catalog/datasets/observations/exports/json/?where=series_key+IN+%28%22FM.D.FR.EUR.FR2.BB.FRMOYTEC10.HSTA%22%29&order_by=-time_period_start";
const ECB_CACHE_KEY = "ecbFr10yCache";
const ECB_CACHE_TTL_MS = 60 * 60 * 1000;
const BDF_API_KEY_KEY = "bdfApiKey";
const GOOGLE_PLACES_KEY_KEY = "googlePlacesApiKey";
const DIAG_ERRORS_KEY = "diagErrors";
const DIAG_ERRORS_LIMIT = 25;
const DIAG_SYNC_KEY = "diagSyncStats";
const DIAG_LAST_SYNC_KEY = "diagLastSyncAt";
const URL_BLOCKER_RULES_KEY = "urlBlockerRules";
const URL_BLOCKER_ENABLED_KEY = "urlBlockerEnabled";
const URL_BLOCKER_BASE_ID = 9000;

try {
  if (chrome?.sidePanel?.setPanelBehavior) {
    chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
  }
} catch (_) {
  // Ignore if side panel API is unavailable.
}

try {
  if (chrome?.action?.onClicked) {
    chrome.action.onClicked.addListener((tab) => {
      if (chrome?.sidePanel?.open && tab?.id != null) {
        chrome.sidePanel.open({ tabId: tab.id }).catch(() => {});
        return;
      }
      if (chrome?.tabs?.create) {
        chrome.tabs.create({ url: "calendar.html" });
      }
    });
  }
} catch (_) {
  // Ignore if side panel API is unavailable.
}

function makeError(message, code, status, meta) {
  const err = new Error(message);
  if (code) err.code = code;
  if (status) err.status = status;
  if (meta) err.meta = meta;
  return err;
}

function summarizePayload(payload) {
  if (payload === null || payload === undefined) return "";
  if (typeof payload === "string") {
    return payload.slice(0, 200);
  }
  try {
    return JSON.stringify(payload).slice(0, 200);
  } catch (_) {
    return String(payload).slice(0, 200);
  }
}

function classifyError(rawMessage, status) {
  const msg = String(rawMessage || "").toLowerCase();
  if (status === 401 || status === 403) return "AUTH_REQUIRED";
  if (status === 404) return "HTTP_404";
  if (status && status >= 500) return "HTTP_5XX";
  if (
    /failed to fetch|networkerror|fetch failed|net::|network request failed/i.test(
      rawMessage || ""
    )
  ) {
    return "NETWORK_ERROR";
  }
  if (/auth_required|auth required|authentication|oauth|token/i.test(msg)) {
    return "AUTH_REQUIRED";
  }
  return status ? `HTTP_${status}` : "UNKNOWN_ERROR";
}

function friendlyMessage(code, fallback) {
  switch (code) {
    case "AUTH_REQUIRED":
      return "Authentification requise. Reconnecte ton compte Google.";
    case "NOTION_DB_NOT_FOUND":
      return "Base Notion introuvable. VÃ©rifie l'ID et le partage.";
    case "NETWORK_ERROR":
      return "Erreur rÃ©seau. VÃ©rifie ta connexion et rÃ©essaie.";
    case "HTTP_404":
      return "Ressource introuvable (404).";
    case "HTTP_429":
      return "Trop de requÃªtes (429). RÃ©essaie dans quelques instants.";
    case "HTTP_5XX":
      return "Service indisponible cÃ´tÃ© serveur. RÃ©essaie plus tard.";
    default:
      return fallback || "Une erreur inconnue est survenue.";
  }
}

function normalizeError(err, context, meta) {
  const rawMessage = String(err?.message || err || "Erreur inconnue");
  const status = Number.isFinite(err?.status) ? err.status : undefined;
  const code = err?.code || classifyError(rawMessage, status);
  const message = friendlyMessage(code, rawMessage);
  return {
    code,
    message,
    rawMessage,
    status: status || null,
    context: context || "operation",
    meta: meta || null,
    at: Date.now(),
  };
}

async function recordDiagnosticError(entry) {
  const { [DIAG_ERRORS_KEY]: stored } = await chrome.storage.local.get([DIAG_ERRORS_KEY]);
  const list = Array.isArray(stored) ? stored : [];
  const next = [entry, ...list].slice(0, DIAG_ERRORS_LIMIT);
  await chrome.storage.local.set({ [DIAG_ERRORS_KEY]: next });
}

async function recordDiagnosticSync(name, status, details) {
  const { [DIAG_SYNC_KEY]: stored } = await chrome.storage.local.get([DIAG_SYNC_KEY]);
  const stats = stored || {};
  stats[name] = {
    status,
    details: details || null,
    at: Date.now(),
  };
  await chrome.storage.local.set({
    [DIAG_SYNC_KEY]: stats,
    [DIAG_LAST_SYNC_KEY]: Date.now(),
  });
}

function notifyUser(title, message, idPrefix = "diag") {
  try {
    const id = `${idPrefix}|${Date.now()}`;
    chrome.notifications.create(id, {
      type: "basic",
      iconUrl: "icons/icon-128.png",
      title,
      message,
      priority: 2,
    });
  } catch (_) {
    // Notifications should never crash the worker.
  }
}

async function handleError(err, context, meta, options = {}) {
  if (err?._handled && err?._handledEntry) {
    return err._handledEntry;
  }
  const entry = normalizeError(err, context, meta);
  await recordDiagnosticError(entry);
  if (options.syncName) {
    await recordDiagnosticSync(options.syncName, "error", {
      code: entry.code,
      message: entry.message,
    });
  }
  if (options.notify) {
    notifyUser(`Erreur: ${context}`, entry.message, `err|${options.syncName || "op"}`);
  }
  try {
    err._handled = true;
    err._handledEntry = entry;
  } catch (_) {
    // Ignore if the error object is not extensible.
  }
  return entry;
}

async function safeFetch(url, options = {}, context = "fetch", allowStatuses = []) {
  let res;
  try {
    res = await fetch(url, options);
  } catch (err) {
    throw makeError(
      "Impossible de contacter le service distant.",
      "NETWORK_ERROR",
      undefined,
      { url, method: options?.method || "GET" }
    );
  }

  const contentType = res.headers.get("content-type") || "";
  let data = null;
  try {
    if (contentType.includes("application/json")) {
      data = await res.json();
    } else {
      data = await res.text();
    }
  } catch (_) {
    data = null;
  }

  if (!res.ok && !allowStatuses.includes(res.status)) {
    const messageFromBody =
      typeof data === "string"
        ? data
        : data?.message || data?.error?.message || "";
    const message = messageFromBody || `HTTP ${res.status}`;
    const err = makeError(message, `HTTP_${res.status}`, res.status, {
      url,
      method: options?.method || "GET",
      body: summarizePayload(data),
    });
    throw err;
  }

  return { res, status: res.status, data };
}

function respondWith(promise, sendResponse, context, options = {}) {
  promise
    .then(async (value) => {
      if (options.syncName && typeof options.successDetails === "function") {
        let details = null;
        try {
          details = options.successDetails(value);
        } catch (_) {
          details = null;
        }
        await recordDiagnosticSync(options.syncName, "ok", details);
      }
      sendResponse(value);
    })
    .catch(async (err) => {
      const entry = await handleError(err, context, options.meta, {
        notify: !!options.notify,
        syncName: options.syncName,
      });
      sendResponse({
        ok: false,
        error: entry.message,
        code: entry.code,
        context: entry.context,
      });
    });
  return true;
}

async function notionFetch(token, path, method, body) {
  const url = `https://api.notion.com/v1/${path}`;
  try {
    const { data } = await safeFetch(
      url,
      {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          "Notion-Version": NOTION_VERSION,
          "Content-Type": "application/json",
        },
        body: body ? JSON.stringify(body) : undefined,
      },
      `Notion ${method} ${path}`
    );
    return typeof data === "string" ? {} : data || {};
  } catch (err) {
    if (err?.status === 404 && path.startsWith("databases/")) {
      throw makeError(
        "Base Notion introuvable (vÃ©rifie l'ID et le partage).",
        "NOTION_DB_NOT_FOUND",
        404,
        { path }
      );
    }
    throw err;
  }
}

function todayISODate() {
  return new Date().toISOString().slice(0, 10);
}

function normalizeText(input) {
  const text = (input ?? "").toString();
  return text.normalize("NFC").trim();
}

function normalizeToUrlFilter(input) {
  const s = normalizeText(input);
  if (!s) return null;

  if (s.startsWith("||")) return s;

  try {
    const u = new URL(s);
    const path = u.pathname || "/";
    const query = u.search || "";
    if (path === "/" && !query) return `||${u.host}^`;
    return `||${u.host}${path}${query}`;
  } catch (_) {
    const parts = s.split("/");
    const host = parts[0];
    const rest = parts.slice(1).join("/");
    if (!rest) return `||${host}^`;
    return `||${s}`;
  }
}

function normalizeUrlBlockerRules(rawRules) {
  const normalized = [];
  const seen = new Set();
  for (const r of rawRules || []) {
    const f = normalizeToUrlFilter(r);
    if (!f || seen.has(f)) continue;
    seen.add(f);
    normalized.push(f);
  }
  return normalized;
}

function isDomainMatch(host, domain) {
  if (!host || !domain) return false;
  const h = host.toLowerCase();
  const d = domain.toLowerCase();
  return h === d || h.endsWith(`.${d}`);
}

function shouldBlockUrl(url, urlFilters) {
  let u;
  try {
    u = new URL(url);
  } catch {
    return false;
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") return false;

  const host = u.hostname;
  const path = `${u.pathname}${u.search}`;

  for (const filter of urlFilters) {
    if (!filter || typeof filter !== "string") continue;
    let f = filter;
    if (f.startsWith("||")) f = f.slice(2);

    if (f.endsWith("^")) {
      const domain = f.slice(0, -1);
      if (isDomainMatch(host, domain)) return true;
      continue;
    }

    const slashIndex = f.indexOf("/");
    if (slashIndex === -1) {
      if (isDomainMatch(host, f)) return true;
      continue;
    }

    const domain = f.slice(0, slashIndex);
    const pathFilter = f.slice(slashIndex);
    if (isDomainMatch(host, domain) && path.startsWith(pathFilter)) return true;
  }

  return false;
}

async function applyUrlBlockerRules() {
  const { [URL_BLOCKER_ENABLED_KEY]: enabled = true, [URL_BLOCKER_RULES_KEY]: rawRules = [] } =
    await chrome.storage.local.get([URL_BLOCKER_ENABLED_KEY, URL_BLOCKER_RULES_KEY]);

  const normalized = normalizeUrlBlockerRules(rawRules);

  const existing = await chrome.declarativeNetRequest.getDynamicRules();
  const removeRuleIds = existing
    .filter((r) => r.id >= URL_BLOCKER_BASE_ID && r.id < URL_BLOCKER_BASE_ID + 10000)
    .map((r) => r.id);

  if (!enabled) {
    await chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds, addRules: [] });
    return;
  }

  const addRules = normalized.map((urlFilter, i) => ({
    id: URL_BLOCKER_BASE_ID + i,
    priority: 1,
    action: { type: "block" },
    condition: { urlFilter },
  }));

  await chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds, addRules });
}

async function ensureUrlBlockerDefaults() {
  const state = await chrome.storage.local.get([URL_BLOCKER_ENABLED_KEY, URL_BLOCKER_RULES_KEY]);
  if (state[URL_BLOCKER_ENABLED_KEY] !== true) {
    await chrome.storage.local.set({ [URL_BLOCKER_ENABLED_KEY]: true });
  }
  if (!Array.isArray(state[URL_BLOCKER_RULES_KEY])) {
    await chrome.storage.local.set({ [URL_BLOCKER_RULES_KEY]: [] });
  }
}

async function checkAllTabsForBlocker() {
  let tabs = [];
  try {
    tabs = await chrome.tabs.query({});
  } catch (_) {
    return;
  }

  const { [URL_BLOCKER_RULES_KEY]: rawRules = [], [URL_BLOCKER_ENABLED_KEY]: enabled = true } =
    await chrome.storage.local.get([URL_BLOCKER_RULES_KEY, URL_BLOCKER_ENABLED_KEY]);
  if (!enabled) return;
  const filters = normalizeUrlBlockerRules(rawRules);
  if (!filters.length) return;

  for (const tab of tabs) {
    if (tab.id == null || !tab.url) continue;
    if (!shouldBlockUrl(tab.url, filters)) continue;
    try {
      await chrome.tabs.remove(tab.id);
    } catch (_) {
      // ignore
    }
  }
}

function toIsoStringLocal(date) {
  return new Date(date).toISOString();
}

function buildAlarmName(eventKey) {
  return `${GCAL_ALARM_PREFIX}${eventKey}`;
}

function buildDeadlineAlarmName(key, offsetHours) {
  return `${DEADLINE_ALARM_PREFIX}${key}|${offsetHours}`;
}

function makeEventKey(calendarId, event) {
  const start = event.start?.dateTime || event.start?.date || "";
  return `${calendarId}|${event.id}|${start}`;
}

async function getAuthToken(interactive) {
  return new Promise((resolve, reject) => {
    chrome.identity.getAuthToken({ interactive }, (token) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve(token);
    });
  });
}

async function gcalRequest(path, interactive, options = {}) {
  let token = await getAuthToken(!!interactive);
  const url = `${GCAL_BASE}/${path}`;
  let first = await safeFetch(
    url,
    {
      method: options.method || "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
    },
    `Google Calendar ${options.method || "GET"} ${path}`,
    [401, 403]
  );
  if (first.status === 401 || first.status === 403) {
    await new Promise((resolve) =>
      chrome.identity.removeCachedAuthToken({ token }, resolve)
    );
    if (!interactive) {
      throw makeError("Authentification Google requise.", "AUTH_REQUIRED", first.status);
    }
    token = await getAuthToken(true);
    first = await safeFetch(
      url,
      {
        method: options.method || "GET",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: options.body ? JSON.stringify(options.body) : undefined,
      },
      `Google Calendar ${options.method || "GET"} ${path}`
    );
  }
  const json = typeof first.data === "string" ? {} : first.data || {};
  return json;
}

async function gcalFetch(path, interactive) {
  return gcalRequest(path, interactive);
}

async function getGooglePlacesKey() {
  const { [GOOGLE_PLACES_KEY_KEY]: key } = await chrome.storage.local.get([
    GOOGLE_PLACES_KEY_KEY,
  ]);
  const trimmed = String(key || "").trim();
  if (!trimmed) {
    throw makeError("Clé Google Places manquante (Options).", "PLACES_KEY_MISSING");
  }
  return trimmed;
}

async function placesAutocomplete(input) {
  const key = await getGooglePlacesKey();
  const params = new URLSearchParams({
    input: String(input || ""),
    key,
    language: "fr",
    types: "geocode",
  });
  const url = `https://maps.googleapis.com/maps/api/place/autocomplete/json?${params.toString()}`;
  const { data } = await safeFetch(url, {}, "Google Places Autocomplete");
  const json = typeof data === "string" ? {} : data || {};
  const status = json.status || "";
  if (status && status !== "OK" && status !== "ZERO_RESULTS") {
    const msg = json.error_message || `Places Autocomplete: ${status}`;
    throw makeError(msg, `PLACES_${status}`);
  }
  const items = (json.predictions || []).map((p) => ({
    description: p.description || "",
    placeId: p.place_id || "",
  }));
  return { ok: true, items };
}

async function placesGeocode(address) {
  const key = await getGooglePlacesKey();
  const params = new URLSearchParams({
    address: String(address || ""),
    key,
    language: "fr",
  });
  const url = `https://maps.googleapis.com/maps/api/geocode/json?${params.toString()}`;
  const { data } = await safeFetch(url, {}, "Google Geocoding");
  const json = typeof data === "string" ? {} : data || {};
  const status = json.status || "";
  if (status && status !== "OK" && status !== "ZERO_RESULTS") {
    const msg = json.error_message || `Geocoding: ${status}`;
    throw makeError(msg, `GEOCODE_${status}`);
  }
  const first = json.results?.[0];
  if (!first) return { ok: true, result: null };
  const loc = first.geometry?.location || {};
  return {
    ok: true,
    result: {
      formattedAddress: first.formatted_address || "",
      lat: Number.isFinite(loc.lat) ? loc.lat : null,
      lng: Number.isFinite(loc.lng) ? loc.lng : null,
    },
  };
}

function buildYahooUrl(params) {
  const qs = new URLSearchParams();
  if (params?.symbols?.length) {
    qs.set("s", params.symbols.join(","));
  }
  if (params?.region) qs.set("region", params.region);
  if (params?.lang) qs.set("lang", params.lang);
  if (params?.category) qs.set("category", params.category);
  const url = `${YAHOO_NEWS_URL}?${qs.toString()}`;
  return url;
}

async function fetchYahooNews(params) {
  const url = buildYahooUrl(params);
  try {
    const { data } = await safeFetch(url, {}, "Yahoo News RSS");
    const xml = typeof data === "string" ? data : "";
    const itemMatches = xml.match(/<item>[\s\S]*?<\/item>/gi) || [];
    const tagValue = (block, tag) => {
      const match = block.match(new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`, "i"));
      if (!match) return "";
      return match[1].replace(/<!\[CDATA\[|\]\]>/g, "").trim();
    };
    const items = itemMatches.map((block) => {
      const title = tagValue(block, "title") || "Article";
      const link = tagValue(block, "link");
      const pubDate = tagValue(block, "pubDate");
      const description = tagValue(block, "description");
      return {
        title: normalizeText(title),
        link,
        pubDate,
        description: normalizeText(description),
      };
    });
    const payload = { fetchedAt: Date.now(), items };
    await chrome.storage.local.set({ yahooNews: payload });
    await recordDiagnosticSync("yahooNews", "ok", { items: items.length });
    return payload;
  } catch (err) {
    await handleError(err, "Yahoo News", { url }, { syncName: "yahooNews" });
    throw err;
  }
}

async function getYahooPrefs() {
  const { yahooNewsPrefs } = await chrome.storage.local.get(["yahooNewsPrefs"]);
  return (
    yahooNewsPrefs || {
      symbols: ["^GSPC"],
      region: "US",
      lang: "en-US",
      category: "",
      quickMode: false,
    }
  );
}

async function getYahooNews(force) {
  const { yahooNews } = await chrome.storage.local.get(["yahooNews"]);
  const prefs = await getYahooPrefs();
  const isFresh =
    yahooNews?.fetchedAt &&
    Date.now() - yahooNews.fetchedAt < YAHOO_NEWS_CACHE_MIN * 60 * 1000;
  if (!force && isFresh && yahooNews?.items?.length) return yahooNews;
  return fetchYahooNews(prefs);
}

async function fetchYahooQuotes(symbols) {
  const list = Array.isArray(symbols) ? symbols.filter(Boolean) : [];
  if (!list.length) return { fetchedAt: Date.now(), bySymbol: {} };
  const bySymbol = {};
  try {
    await Promise.all(
      list.map(async (symbol) => {
        const url = `${YAHOO_CHART_URL}/${encodeURIComponent(
          symbol
        )}?interval=1d&range=1d`;
        try {
          const { data } = await safeFetch(url, {}, `Yahoo Quote ${symbol}`);
          const json = typeof data === "string" ? {} : data || {};
          const result = json?.chart?.result?.[0];
          const price =
            result?.meta?.regularMarketPrice ??
            result?.indicators?.quote?.[0]?.close?.slice(-1)?.[0];
          const changePercent = result?.meta?.regularMarketChangePercent;
          bySymbol[symbol] = {
            symbol,
            price: price ?? null,
            changePercent: Number.isFinite(changePercent) ? changePercent : null,
            currency: result?.meta?.currency || "",
            updatedAt: Date.now(),
          };
        } catch (err) {
          await handleError(
            err,
            "Yahoo Quotes",
            { symbol, url },
            { syncName: "yahooQuotes" }
          );
        }
      })
    );
    const payload = { fetchedAt: Date.now(), bySymbol };
    await chrome.storage.local.set({ yahooQuotes: payload });
    await recordDiagnosticSync("yahooQuotes", "ok", {
      symbols: Object.keys(bySymbol).length,
    });
    return payload;
  } catch (err) {
    await handleError(err, "Yahoo Quotes", null, { syncName: "yahooQuotes" });
    throw err;
  }
}

async function getYahooQuotes(symbols, force) {
  const { yahooQuotes } = await chrome.storage.local.get(["yahooQuotes"]);
  const isFresh =
    yahooQuotes?.fetchedAt &&
    Date.now() - yahooQuotes.fetchedAt < YAHOO_QUOTE_CACHE_MIN * 60 * 1000;
  if (!force && isFresh && yahooQuotes?.bySymbol) return yahooQuotes;
  return fetchYahooQuotes(symbols);
}

async function fetchEcbFr10y() {
  let json;
  try {
    const { [BDF_API_KEY_KEY]: bdfApiKey } = await chrome.storage.local.get([BDF_API_KEY_KEY]);
    const headers = {};
    if (bdfApiKey) {
      // Banque de France Webstat can require an API key; send it when configured.
      headers["X-API-KEY"] = bdfApiKey;
      headers.apikey = bdfApiKey;
    }
    const { data } = await safeFetch(
      ECB_FR10Y_URL,
      { headers },
      "Banque de France FR10Y"
    );
    json = typeof data === "string" ? {} : data || {};
  } catch (err) {
    await handleError(err, "Banque de France FR10Y", { url: ECB_FR10Y_URL }, {
      syncName: "ecbFr10y",
    });
    throw err;
  }

  // Banque de France Webstat responses can vary; prefer the first observation.
  function extractFromObservation(obs) {
    if (!obs || typeof obs !== "object") return null;
    const candidates = [
      obs.obs_value,
      obs.value,
      obs.OBS_VALUE,
      obs.observation_value,
    ];
    for (const c of candidates) {
      const n = Number.parseFloat(c);
      if (Number.isFinite(n)) return n;
    }
    return null;
  }

  if (Array.isArray(json) && json.length > 0) {
    const direct = extractFromObservation(json[0]);
    if (Number.isFinite(direct)) {
      const payload = { fetchedAt: Date.now(), value: direct };
      await chrome.storage.local.set({ [ECB_CACHE_KEY]: payload });
      await recordDiagnosticSync("ecbFr10y", "ok", { value: direct });
      return payload;
    }
  }

  // Fallback: walk the tree and keep the last number found.
  function extractLastNumber(node) {
    let last = null;
    const visit = (value) => {
      if (value === null || value === undefined) return;
      if (typeof value === "number" && Number.isFinite(value)) {
        last = value;
        return;
      }
      if (typeof value === "string") {
        const n = Number.parseFloat(value);
        if (Number.isFinite(n)) last = n;
        return;
      }
      if (Array.isArray(value)) {
        value.forEach(visit);
        return;
      }
      if (typeof value === "object") {
        Object.values(value).forEach(visit);
      }
    };
    visit(node);
    return last;
  }

  const lastVal = extractLastNumber(json);
  const payload = { fetchedAt: Date.now(), value: lastVal };
  await chrome.storage.local.set({ [ECB_CACHE_KEY]: payload });
  await recordDiagnosticSync("ecbFr10y", "ok", { value: lastVal });
  return payload;
}

async function getEcbFr10y(force) {
  const { [ECB_CACHE_KEY]: cached } = await chrome.storage.local.get([ECB_CACHE_KEY]);
  const fresh = cached?.fetchedAt && Date.now() - cached.fetchedAt < ECB_CACHE_TTL_MS;
  if (!force && fresh) return cached;
  return fetchEcbFr10y();
}

async function listCalendars(interactive) {
  const data = await gcalFetch("users/me/calendarList", interactive);
  const items = (data.items || []).map((c) => ({
    id: c.id,
    summary: c.summary || c.summaryOverride || c.id,
    primary: !!c.primary,
    selected: !!c.selected,
    accessRole: c.accessRole,
    backgroundColor: c.backgroundColor || "",
    foregroundColor: c.foregroundColor || "",
  }));
  return items;
}

async function listCalendarEvents(calendarId, timeMin, timeMax, interactive) {
  const params = new URLSearchParams({
    timeMin,
    timeMax,
    singleEvents: "true",
    orderBy: "startTime",
    maxResults: String(GCAL_EVENTS_MAX),
    conferenceDataVersion: "1",
  });
  const data = await gcalFetch(
    `calendars/${encodeURIComponent(calendarId)}/events?${params.toString()}`,
    interactive
  );
  return data.items || [];
}

async function createCalendarEvent(calendarId, event) {
  const data = await gcalRequest(
    `calendars/${encodeURIComponent(calendarId)}/events`,
    true,
    { method: "POST", body: event }
  );
  return data;
}

async function updateCalendarEvent(calendarId, eventId, patch, sendUpdates = "all") {
  const params = new URLSearchParams();
  params.set("sendUpdates", sendUpdates);
  if (patch && Object.prototype.hasOwnProperty.call(patch, "conferenceData")) {
    params.set("conferenceDataVersion", "1");
  }
  const path = `calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(
    eventId
  )}?${params.toString()}`;
  return gcalRequest(path, true, { method: "PATCH", body: patch });
}

async function deleteCalendarEvent(calendarId, eventId, sendUpdates = "all") {
  const params = new URLSearchParams();
  params.set("sendUpdates", sendUpdates);
  const path = `calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(
    eventId
  )}?${params.toString()}`;
  return gcalRequest(path, true, { method: "DELETE" });
}

function normalizeAttendees(list) {
  if (!Array.isArray(list)) return [];
  const emails = list
    .map((item) => (typeof item === "string" ? item : item?.email))
    .map((email) => String(email || "").trim())
    .filter(Boolean);
  const unique = Array.from(new Set(emails));
  return unique.map((email) => ({ email }));
}

function buildConferenceData(useMeet) {
  if (!useMeet) return undefined;
  const requestId =
    (typeof crypto !== "undefined" && crypto.randomUUID && crypto.randomUUID()) ||
    `meet-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return {
    createRequest: {
      requestId,
      conferenceSolutionKey: { type: "hangoutsMeet" },
    },
  };
}

function buildEventDateTimes(input) {
  const start = input?.start || {};
  const end = input?.end || {};
  if (start.date && end.date) {
    return {
      start: { date: start.date },
      end: { date: end.date },
    };
  }
  if (start.dateTime && end.dateTime) {
    const startPayload = { dateTime: start.dateTime };
    const endPayload = { dateTime: end.dateTime };
    if (start.timeZone) startPayload.timeZone = start.timeZone;
    if (end.timeZone) endPayload.timeZone = end.timeZone;
    return { start: startPayload, end: endPayload };
  }
  throw makeError(
    "Dates invalides. Fournis start/end en {date} ou en {dateTime, timeZone}.",
    "GCAL_INVALID_DATES"
  );
}

async function createCalendarEventWithInvites(calendarId, payload) {
  const syncName = "gcalCreateEventWithInvites";
  try {
    if (!calendarId) {
      throw makeError("calendarId manquant.", "GCAL_CALENDAR_ID_MISSING");
    }
    const summary = normalizeText(payload?.summary || "");
    if (!summary) {
      throw makeError("Titre d'Ã©vÃ©nement manquant.", "GCAL_SUMMARY_MISSING");
    }

    const dateTimes = buildEventDateTimes(payload);
    const attendees = normalizeAttendees(payload?.attendees);
    const useMeet = !!payload?.useMeet;
    const sendUpdates = payload?.sendUpdates || "all";

    const event = {
      summary,
      description: normalizeText(payload?.description || ""),
      location: normalizeText(payload?.location || ""),
      ...dateTimes,
    };
    if (attendees.length) {
      event.attendees = attendees;
    }

    const conferenceData = buildConferenceData(useMeet);
    if (conferenceData) {
      event.conferenceData = conferenceData;
    }

    const params = new URLSearchParams();
    if (attendees.length) {
      params.set("sendUpdates", sendUpdates);
    }
    if (conferenceData) {
      params.set("conferenceDataVersion", "1");
    }
    const query = params.toString();
    const path = query
      ? `calendars/${encodeURIComponent(calendarId)}/events?${query}`
      : `calendars/${encodeURIComponent(calendarId)}/events`;

    const created = await gcalRequest(path, true, {
      method: "POST",
      body: event,
    });

    await recordDiagnosticSync(syncName, "ok", {
      calendarId,
      attendees: attendees.length,
      meet: useMeet,
      eventId: created?.id || null,
    });

    return { ok: true, event: created };
  } catch (err) {
    await handleError(err, "Google Calendar - crÃ©ation + invitations", { calendarId }, {
      syncName,
      notify: true,
    });
    throw err;
  }
}

async function syncNotionToCalendar() {
  const syncName = "notionToCalendar";
  try {
    const { notionToken: token, notionDbId: dbId } = await chrome.storage.sync.get([
      "notionToken",
      "notionDbId",
    ]);
    const { notionFieldMap, notionStatusMap } = await chrome.storage.sync.get([
      "notionFieldMap",
      "notionStatusMap",
    ]);
    const map = notionFieldMap || {};
    const statusMap = notionStatusMap || {};
    const { gcalDefaultCalendar } = await chrome.storage.local.get(["gcalDefaultCalendar"]);
    const calendarId = gcalDefaultCalendar || "primary";

    if (!token || !dbId) {
      throw makeError("Configuration Notion manquante (Options).", "NOTION_CONFIG_MISSING");
    }
    const normalizedDbId = normalizeDbId(dbId);
    if (!normalizedDbId) {
      throw makeError(
        "ID de base Notion invalide. Colle l'URL ou l'ID dans Options.",
        "NOTION_DB_ID_INVALID"
      );
    }

    const rows = await listDbRows(token, normalizedDbId);
    const { [NOTION_SYNC_MAP]: storedMap } = await chrome.storage.local.get([NOTION_SYNC_MAP]);
    const syncMap = storedMap || {};
    let createdCount = 0;

    for (const r of rows) {
      const p = r.properties || {};
      const jobTitleKey = map.jobTitle || "Job Title";
      const companyKey = map.company || "Entreprise";
      const urlKey = map.url || "lien offre";
      const startMonthKey = map.startMonth || "Start month";
      const openDateKey = map.openDate || "Date d'ouverture";
      const closeDateKey = map.closeDate || "Date de fermeture";

      const title = normalizeText(propText(p[jobTitleKey]) || propText(p["Name"]) || "");
      const company = normalizeText(propText(p[companyKey]) || "");
      const url = propText(p[urlKey]) || "";
      const dateText =
        propText(p[startMonthKey]) ||
        propText(p[openDateKey]) ||
        propText(p[closeDateKey]) ||
        "";
      const date = parseDateFromText(dateText);
      if (!date) continue;

      const key = `${r.id}|${date}`;
      if (syncMap[key]) continue;

      const summary = [company, title].filter(Boolean).join(" - ") || "Stage";
      const event = {
        summary,
        description: url,
        start: { date },
        end: { date },
      };

      const created = await createCalendarEvent(calendarId, event);
      syncMap[key] = {
        eventId: created.id,
        calendarId,
        date,
        createdAt: Date.now(),
      };
      createdCount += 1;
    }

    await chrome.storage.local.set({ [NOTION_SYNC_MAP]: syncMap });
    await recordDiagnosticSync(syncName, "ok", {
      created: createdCount,
      scanned: rows.length,
      calendarId,
      statusMapApplied: !!statusMap,
    });
    return { ok: true, created: createdCount, scanned: rows.length };
  } catch (err) {
    await handleError(err, "Sync Notion â†’ Calendar", null, {
      syncName,
      notify: true,
    });
    throw err;
  }
}

function eventStartDate(event) {
  const dt = event.start?.dateTime || event.start?.date;
  return dt ? new Date(dt) : null;
}

function eventEndDate(event) {
  const dt = event.end?.dateTime || event.end?.date;
  return dt ? new Date(dt) : null;
}

function pickUrl(text) {
  const matches = String(text || "").match(/https?:\/\/[^\s<]+/gi) || [];
  if (!matches.length) return "";
  const priority = matches.find((u) =>
    /(meet\.google\.com|zoom\.us\/j\/|teams\.microsoft\.com\/l\/meetup-join)/i.test(u)
  );
  return priority || matches[0];
}

function extractMeetingLink(event) {
  if (event?.hangoutLink) return event.hangoutLink;
  const entry = event?.conferenceData?.entryPoints?.find((p) => p.entryPointType === "video");
  if (entry?.uri) return entry.uri;
  const fromLocation = pickUrl(event?.location);
  if (fromLocation) return fromLocation;
  return pickUrl(event?.description);
}

function parseDateFromText(value) {
  if (!value) return null;
  const isoMatch = String(value).match(/\b\d{4}-\d{2}-\d{2}\b/);
  if (isoMatch) return isoMatch[0];
  const parsed = new Date(value);
  if (!Number.isNaN(parsed.getTime())) {
    const y = parsed.getFullYear();
    const m = String(parsed.getMonth() + 1).padStart(2, "0");
    const d = String(parsed.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  return null;
}

function isNetworkError(err) {
  const msg = String(err?.message || err || "");
  return /failed to fetch|networkerror|fetch failed|net::/i.test(msg);
}

function getDefaultTagRules() {
  return [
    { tag: "meeting", contains: ["meet.google.com", "zoom.us", "teams.microsoft.com"] },
    { tag: "deadline", contains: ["deadline", "due", "date limite"] },
    { tag: "entretien", contains: ["interview", "entretien"] },
    { tag: "important", contains: ["urgent", "important"] },
  ];
}

async function getTagRules() {
  const { autoTagRules } = await chrome.storage.local.get([TAG_RULES_KEY]);
  if (Array.isArray(autoTagRules) && autoTagRules.length) return autoTagRules;
  return getDefaultTagRules();
}

function tagItem(text, rules) {
  const hay = String(text || "").toLowerCase();
  const tags = [];
  rules.forEach((rule) => {
    const list = Array.isArray(rule.contains) ? rule.contains : [];
    const hit = list.some((needle) => hay.includes(String(needle || "").toLowerCase()));
    if (hit) tags.push(rule.tag);
  });
  return tags;
}

async function scheduleEventAlerts(eventsByCalendar) {
  const { gcalEventMap, gcalNotifyCalendars } = await chrome.storage.local.get([
    "gcalEventMap",
    "gcalNotifyCalendars",
  ]);
  const map = gcalEventMap || {};
  const now = Date.now();
  const notifyEnabled = Array.isArray(gcalNotifyCalendars) ? gcalNotifyCalendars : null;

  for (const item of eventsByCalendar) {
    const { calendarId, calendarSummary, events } = item;
    if (notifyEnabled && !notifyEnabled.includes(calendarId)) continue;
    for (const ev of events) {
      const start = eventStartDate(ev);
      if (!start) continue;
      const alarmTime = start.getTime() - GCAL_NOTIFY_MINUTES * 60 * 1000;
      if (alarmTime <= now) continue;

      const eventKey = makeEventKey(calendarId, ev);
      const alarmName = buildAlarmName(eventKey);
      map[alarmName] = {
        calendarId,
        calendarSummary,
        eventId: ev.id,
        summary: ev.summary || "Evenement",
        start: start.toISOString(),
      };

      chrome.alarms.create(alarmName, { when: alarmTime });
    }
  }

  await chrome.storage.local.set({ gcalEventMap: map });
}

async function loadEventsRange(timeMin, timeMax, calendarIds, interactive) {
  const syncName = "gcalEvents";
  try {
    const tagRules = await getTagRules();
    const cacheKey = JSON.stringify({ timeMin, timeMax, calendarIds });
    const { gcalEventCache } = await chrome.storage.local.get([GCAL_CACHE_KEY]);
    const cache = gcalEventCache || {};
    const cached = cache[cacheKey];
    if (cached && Date.now() - cached.fetchedAt < GCAL_CACHE_TTL_MS) {
      await recordDiagnosticSync(syncName, "ok", {
        cached: true,
        count: Array.isArray(cached.events) ? cached.events.length : 0,
      });
      return cached.events || [];
    }

    const calendars = await listCalendars(interactive);
    const selectedIds =
      Array.isArray(calendarIds) && calendarIds.length > 0
        ? calendarIds
        : calendars.map((c) => c.id);

    const activeCalendars = calendars
      .filter((c) => selectedIds.includes(c.id))
      .filter((c) => c.accessRole !== "freeBusyReader");

    const eventsByCalendar = await Promise.all(
      activeCalendars.map(async (cal) => ({
        calendarId: cal.id,
        calendarSummary: cal.summary,
        events: await listCalendarEvents(cal.id, timeMin, timeMax, interactive),
      }))
    );

    await scheduleEventAlerts(eventsByCalendar);

    const flat = [];
    const now = Date.now();
    for (const bucket of eventsByCalendar) {
      for (const ev of bucket.events) {
        const startMs = eventStartDate(ev)?.getTime();
        if (!startMs || startMs < now) continue;
        flat.push({
          id: ev.id,
          summary: ev.summary || "Evenement",
          location: ev.location || "",
          start: ev.start?.dateTime || ev.start?.date || "",
          end: ev.end?.dateTime || ev.end?.date || "",
        calendarId: bucket.calendarId,
        calendarSummary: bucket.calendarSummary,
        htmlLink: ev.htmlLink || "",
        sourceUrl: ev.source?.url || "",
        description: ev.description || "",
        attendees: (ev.attendees || [])
          .map((a) => a?.email)
          .filter(Boolean),
        meetingLink: extractMeetingLink(ev),
        tags: tagItem(
          `${ev.summary || ""} ${ev.location || ""} ${ev.description || ""} ${
            ev.htmlLink || ""
          }`,
            tagRules
          ),
        });
      }
    }

    const sorted = flat.sort((a, b) => new Date(a.start) - new Date(b.start));
    cache[cacheKey] = { fetchedAt: Date.now(), events: sorted };
    await chrome.storage.local.set({ [GCAL_CACHE_KEY]: cache });
    await recordDiagnosticSync(syncName, "ok", {
      cached: false,
      calendars: activeCalendars.length,
      count: sorted.length,
    });
    return sorted;
  } catch (err) {
    await handleError(
      err,
      "Google Calendar - chargement des Ã©vÃ©nements",
      { timeMin, timeMax },
      { syncName }
    );
    throw err;
  }
}

async function scheduleDeadlineAlerts(rows, map) {
  const { deadlinePrefs } = await chrome.storage.local.get([DEADLINE_PREFS_KEY]);
  const prefs = deadlinePrefs || { enabled: true, offsets: [24, 48, 168] };
  if (!prefs.enabled) return;

  const urlKey = map.url || "lien offre";
  const closeDateKey = map.closeDate || "Date de fermeture";
  const companyKey = map.company || "Entreprise";
  const titleKey = map.jobTitle || "Job Title";

  const now = Date.now();
  for (const r of rows) {
    const p = r.properties || {};
    const closeDateText = propText(p[closeDateKey]) || "";
    const date = parseDateFromText(closeDateText);
    if (!date) continue;

    const end = new Date(`${date}T09:00:00`);
    if (Number.isNaN(end.getTime())) continue;

    const summary = [propText(p[companyKey]), propText(p[titleKey])]
      .filter(Boolean)
      .join(" - ") || "Deadline stage";
    const url = propText(p[urlKey]) || "";
    const key = `${r.id}|${date}`;

    prefs.offsets.forEach((hours) => {
      const when = end.getTime() - hours * 60 * 60 * 1000;
      if (when <= now) return;
      const alarmName = buildDeadlineAlarmName(key, hours);
      chrome.alarms.create(alarmName, { when });
      chrome.storage.local.set({
        [alarmName]: {
          summary,
          url,
          date,
          hours,
        },
      });
    });
  }
}

function normalizeDbId(input) {
  const raw = (input || "").trim();
  if (!raw) return "";

  let s = raw;
  if (/^https?:\/\//i.test(s)) {
    try {
      const u = new URL(s);
      s = u.pathname || s;
    } catch (_) {
      // keep raw
    }
  }

  s = s.split("?")[0].split("#")[0];
  const parts = s.split("/");
  s = parts[parts.length - 1] || s;

  const uuid = s.match(/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/);
  if (uuid) return uuid[0].replace(/-/g, "");

  const hex = s.match(/[0-9a-fA-F]{32}/);
  if (hex) return hex[0];

  const uuidInRaw = raw.match(/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/);
  if (uuidInRaw) return uuidInRaw[0].replace(/-/g, "");

  const hexInRaw = raw.match(/[0-9a-fA-F]{32}/);
  if (hexInRaw) return hexInRaw[0];

  return "";
}

async function findByUrl(token, dbId, url, map) {
  const body = {
    filter: {
      property: (map?.url || "lien offre"),
      url: { equals: url },
    },
  };
  const r = await notionFetch(token, `databases/${dbId}/query`, "POST", body);
  return r.results?.[0] || null;
}

function buildProps(data, map, statusMap) {
  const m = map || {};
  const smap = statusMap || {};
  const props = {
    [m.jobTitle || "Job Title"]: { rich_text: [{ text: { content: normalizeText(data.title) || "Sans titre" } }] },
    [m.company || "Entreprise"]: { title: [{ text: { content: normalizeText(data.company) || "" } }] },
    [m.location || "Lieu"]: { rich_text: [{ text: { content: normalizeText(data.location) || "" } }] },
    [m.url || "lien offre"]: { rich_text: [{ text: { content: normalizeText(data.url) || "" } }] },
    [m.status || "Status"]: {
      status: {
        name: data.applied
          ? (smap.applied || "Candidature envoyee")
          : (smap.open || "Ouvert"),
      },
    },
  };
  if (data.applied) {
    props[m.applicationDate || "Application Date"] = { date: { start: todayISODate() } };
  }
  if (data.datePosted) {
    props[m.openDate || "Date d'ouverture"] = {
      rich_text: [{ text: { content: normalizeText(data.datePosted) } }],
    };
  }

  if (data.startDate) {
    props[m.startMonth || "Start month"] = {
      rich_text: [{ text: { content: normalizeText(data.startDate) } }],
    };
  }
  const roleValues = String(data.role || "Off-cycle")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (roleValues.length) {
    props[m.role || "Role"] = { multi_select: roleValues.map((name) => ({ name })) };
  }
  if (data.type) {
    props[m.type || "Type d'infrastructure"] = {
      rich_text: [{ text: { content: normalizeText(data.type) } }],
    };
  }
  if (data.deadline) {
    props[m.closeDate || "Date de fermeture"] = {
      rich_text: [{ text: { content: normalizeText(data.deadline) } }],
    };
  }

  return props;
}

async function upsertToNotion(payload) {
  const { notionToken: token, notionDbId: dbId } = await chrome.storage.sync.get([
    "notionToken",
    "notionDbId",
  ]);

  if (!token || !dbId) throw new Error("Config Notion manquante (Options).");
  const normalizedDbId = normalizeDbId(dbId);
  if (!normalizedDbId) {
    throw new Error("Invalid database ID. Please paste the database URL or ID in Options.");
  }

  const { notionFieldMap, notionStatusMap } = await chrome.storage.sync.get([
    "notionFieldMap",
    "notionStatusMap",
  ]);
  const map = notionFieldMap || {};
  const statusMap = notionStatusMap || {};

  try {
    const existing = await findByUrl(token, normalizedDbId, payload.url, map);
    const properties = buildProps(payload, map, statusMap);

    if (existing) {
      await notionFetch(token, `pages/${existing.id}`, "PATCH", { properties });
      return { ok: true, mode: "updated" };
    } else {
      await notionFetch(token, "pages", "POST", {
        parent: { database_id: normalizedDbId },
        properties,
      });
      return { ok: true, mode: "created" };
    }
  } catch (e) {
    if (!isNetworkError(e)) {
      throw e;
    }
    const { [OFFLINE_QUEUE_KEY]: queue } = await chrome.storage.local.get([OFFLINE_QUEUE_KEY]);
    const next = Array.isArray(queue) ? queue : [];
    next.push({ payload, createdAt: Date.now() });
    await chrome.storage.local.set({ [OFFLINE_QUEUE_KEY]: next });
    return { ok: true, mode: "queued" };
  }
}

function propText(prop) {
  if (!prop) return "";
  if (prop.type === "title") {
    return (prop.title || []).map((t) => t?.plain_text || "").join("").trim();
  }
  if (prop.type === "rich_text") {
    return (prop.rich_text || []).map((t) => t?.plain_text || "").join("").trim();
  }
  if (prop.type === "select") return prop.select?.name || "";
  if (prop.type === "status") return prop.status?.name || "";
  if (prop.type === "multi_select") {
    return (prop.multi_select || []).map((t) => t?.name || "").filter(Boolean).join(", ");
  }
  if (prop.type === "url") return prop.url || "";
  if (prop.type === "date") return prop.date?.start || "";
  if (prop.type === "checkbox") return prop.checkbox ? "true" : "false";
  return "";
}

async function listDbRows(token, dbId, filter) {
  let rows = [];
  let cursor = undefined;

  while (rows.length < MAX_LIST_ROWS) {
    const body = { page_size: 100 };
    if (filter) body.filter = filter;
    if (cursor) body.start_cursor = cursor;
    const r = await notionFetch(token, `databases/${dbId}/query`, "POST", body);
    rows = rows.concat(r.results || []);
    if (!r.has_more || !r.next_cursor) break;
    cursor = r.next_cursor;
  }

  return rows.slice(0, MAX_LIST_ROWS);
}

async function checkDbAndLoad() {
  const { notionToken: token, notionDbId: dbId } = await chrome.storage.sync.get([
    "notionToken",
    "notionDbId",
  ]);
  const { notionFieldMap } = await chrome.storage.sync.get(["notionFieldMap"]);
  const map = notionFieldMap || {};

  if (!token || !dbId) throw new Error("Config Notion manquante (Options).");
  const normalizedDbId = normalizeDbId(dbId);
  if (!normalizedDbId) {
    throw new Error("Invalid database ID. Please paste the database URL or ID in Options.");
  }

  const db = await notionFetch(token, `databases/${normalizedDbId}`, "GET");
  const rows = await listDbRows(token, normalizedDbId);
  await scheduleDeadlineAlerts(rows, map);

  const mapped = rows.map((r) => {
    const p = r.properties || {};
    const jobTitleKey = map.jobTitle || "Job Title";
    const companyKey = map.company || "Entreprise";
    const locationKey = map.location || "Lieu";
    const urlKey = map.url || "lien offre";
    const statusKey = map.status || "Status";
    const roleKey = map.role || "Role";
    const typeKey = map.type || "Type d'infrastructure";
    const applicationDateKey = map.applicationDate || "Application Date";
    const startMonthKey = map.startMonth || "Start month";
    const openDateKey = map.openDate || "Date d'ouverture";
    const closeDateKey = map.closeDate || "Date de fermeture";
    return {
      id: r.id,
      title: propText(p[jobTitleKey]) || propText(p["Name"]) || "",
      company: propText(p[companyKey]) || "",
      location: propText(p[locationKey]) || "",
      url: propText(p[urlKey]) || "",
      status: propText(p[statusKey]) || "",
      role: propText(p[roleKey]) || "",
      type: propText(p[typeKey]) || "",
      applicationDate: propText(p[applicationDateKey]) || "",
      startMonth: propText(p[startMonthKey]) || "",
      openDate: propText(p[openDateKey]) || "",
      closeDate: propText(p[closeDateKey]) || "",
    };
  });

  const dbTitle = (db.title || []).map((t) => t?.plain_text || "").join("").trim();
  const columns = Object.keys(db.properties || {}).sort((a, b) => a.localeCompare(b));

  return {
    ok: true,
    dbTitle,
    columns,
    rows: mapped,
    total: rows.length,
    capped: rows.length >= MAX_LIST_ROWS,
  };
}

async function listOpenStages() {
  const { notionToken: token, notionDbId: dbId } = await chrome.storage.sync.get([
    "notionToken",
    "notionDbId",
  ]);
  const { notionFieldMap } = await chrome.storage.sync.get(["notionFieldMap"]);
  const map = notionFieldMap || {};

  if (!token || !dbId) throw new Error("Config Notion manquante (Options).");
  const normalizedDbId = normalizeDbId(dbId);
  if (!normalizedDbId) {
    throw new Error("Invalid database ID. Please paste the database URL or ID in Options.");
  }

  const db = await notionFetch(token, `databases/${normalizedDbId}`, "GET");
  const statusKey = map.status || "Status";
  const statusProp = db.properties?.[statusKey];
  if (!statusProp) throw new Error("Colonne Status introuvable dans la base.");

  let filter = null;
  if (statusProp.type === "status") {
    filter = { property: statusKey, status: { equals: "Ouvert" } };
  } else if (statusProp.type === "select") {
    filter = { property: statusKey, select: { equals: "Ouvert" } };
  } else if (statusProp.type === "rich_text" || statusProp.type === "title") {
    filter = { property: statusKey, rich_text: { equals: "Ouvert" } };
  } else {
    throw new Error("Type de colonne Status non supporte pour le filtre.");
  }

  const rows = await listDbRows(token, normalizedDbId, filter);
  const mapped = rows.map((r) => {
    const p = r.properties || {};
    const jobTitleKey = map.jobTitle || "Job Title";
    const companyKey = map.company || "Entreprise";
    const urlKey = map.url || "lien offre";
    const statusKeyLocal = map.status || "Status";
    return {
      id: r.id,
      title: propText(p[jobTitleKey]) || propText(p["Name"]) || "",
      company: propText(p[companyKey]) || "",
      url: propText(p[urlKey]) || "",
      status: propText(p[statusKeyLocal]) || "",
    };
  });

  return {
    ok: true,
    items: mapped,
    total: rows.length,
    capped: rows.length >= MAX_LIST_ROWS,
  };
}

function buildStatusFilter(statusProp, names, statusKey) {
  const items = (names || []).filter(Boolean);
  if (items.length === 0) return null;

  if (statusProp.type === "status") {
    return { or: items.map((name) => ({ property: statusKey, status: { equals: name } })) };
  }
  if (statusProp.type === "select") {
    return { or: items.map((name) => ({ property: statusKey, select: { equals: name } })) };
  }
  if (statusProp.type === "rich_text" || statusProp.type === "title") {
    return { or: items.map((name) => ({ property: statusKey, rich_text: { equals: name } })) };
  }
  return null;
}

async function listTodoStages() {
  const { notionToken: token, notionDbId: dbId } = await chrome.storage.sync.get([
    "notionToken",
    "notionDbId",
  ]);
  const { notionFieldMap } = await chrome.storage.sync.get(["notionFieldMap"]);
  const map = notionFieldMap || {};

  if (!token || !dbId) throw new Error("Config Notion manquante (Options).");
  const normalizedDbId = normalizeDbId(dbId);
  if (!normalizedDbId) {
    throw new Error("Invalid database ID. Please paste the database URL or ID in Options.");
  }

  const db = await notionFetch(token, `databases/${normalizedDbId}`, "GET");
  const statusKey = map.status || "Status";
  const statusProp = db.properties?.[statusKey];
  if (!statusProp) throw new Error("Colonne Status introuvable dans la base.");

  const filter = buildStatusFilter(statusProp, ["OA to do", "HV to do"], statusKey);
  if (!filter) throw new Error("Type de colonne Status non supporte pour le filtre.");

  const rows = await listDbRows(token, normalizedDbId, filter);
  const mapped = rows.map((r) => {
    const p = r.properties || {};
    const jobTitleKey = map.jobTitle || "Job Title";
    const companyKey = map.company || "Entreprise";
    const urlKey = map.url || "lien offre";
    const statusKeyLocal = map.status || "Status";
    return {
      id: r.id,
      title: propText(p[jobTitleKey]) || propText(p["Name"]) || "",
      company: propText(p[companyKey]) || "",
      url: propText(p[urlKey]) || "",
      status: propText(p[statusKeyLocal]) || "",
    };
  });

  return {
    ok: true,
    items: mapped,
    total: rows.length,
    capped: rows.length >= MAX_LIST_ROWS,
  };
}

function normalizeStatus(value) {
  return normalizeText(value || "").toLowerCase();
}

function isAppliedStatus(norm) {
  return (
    norm === "candidature envoyée" ||
    norm === "candidature envoyee" ||
    norm === "candidatures envoyées" ||
    norm === "candidatures envoyees" ||
    norm === "postulé" ||
    norm === "postule" ||
    norm === "candidature envoyee" ||
    norm === "envoyée" ||
    norm === "envoyee"
  );
}

async function getStageStatusStats() {
  const { notionToken: token, notionDbId: dbId } = await chrome.storage.sync.get([
    "notionToken",
    "notionDbId",
  ]);
  const { notionFieldMap } = await chrome.storage.sync.get(["notionFieldMap"]);
  const map = notionFieldMap || {};

  if (!token || !dbId) throw new Error("Config Notion manquante (Options).");
  const normalizedDbId = normalizeDbId(dbId);
  if (!normalizedDbId) {
    throw new Error("Invalid database ID. Please paste the database URL or ID in Options.");
  }

  const db = await notionFetch(token, `databases/${normalizedDbId}`, "GET");
  const statusKey = map.status || "Status";
  const statusProp = db.properties?.[statusKey];
  if (!statusProp) throw new Error("Colonne Status introuvable dans la base.");

  const rows = await listDbRows(token, normalizedDbId, null);
  const counts = new Map();
  rows.forEach((r) => {
    const p = r.properties || {};
    const raw = propText(p[statusKey]) || "Non renseigne";
    const key = raw.trim() || "Non renseigne";
    counts.set(key, (counts.get(key) || 0) + 1);
  });

  let openCount = 0;
  let appliedCount = 0;
  let recaleCount = 0;
  const otherBreakdown = [];

  counts.forEach((count, status) => {
    const norm = normalizeStatus(status);
    if (norm === "ouvert") {
      openCount += count;
      return;
    }
    if (isAppliedStatus(norm)) {
      appliedCount += count;
      return;
    }
    if (norm === "recalé" || norm === "recale") {
      recaleCount += count;
      return;
    }
    otherBreakdown.push({ status, count });
  });

  otherBreakdown.sort((a, b) => b.count - a.count);

  const total = rows.length;
  const otherCount = Math.max(0, total - openCount - appliedCount - recaleCount);

  return {
    ok: true,
    total,
    open: openCount,
    applied: appliedCount,
    recale: recaleCount,
    other: otherCount,
    otherBreakdown,
    capped: rows.length >= MAX_LIST_ROWS,
  };
}

async function listStageDeadlines() {
  const { notionToken: token, notionDbId: dbId } = await chrome.storage.sync.get([
    "notionToken",
    "notionDbId",
  ]);
  const { notionFieldMap } = await chrome.storage.sync.get(["notionFieldMap"]);
  const map = notionFieldMap || {};

  if (!token || !dbId) throw new Error("Config Notion manquante (Options).");
  const normalizedDbId = normalizeDbId(dbId);
  if (!normalizedDbId) {
    throw new Error("Invalid database ID. Please paste the database URL or ID in Options.");
  }

  const db = await notionFetch(token, `databases/${normalizedDbId}`, "GET");
  const statusKey = map.status || "Status";
  const closeDateKey = map.closeDate || "Date de fermeture";
  const jobTitleKey = map.jobTitle || "Job Title";
  const companyKey = map.company || "Entreprise";
  const urlKey = map.url || "lien offre";

  if (!db.properties?.[closeDateKey]) throw new Error("Colonne Date de fermeture introuvable.");

  const rows = await listDbRows(token, normalizedDbId, null);
  const now = new Date();
  const horizon = new Date();
  horizon.setDate(horizon.getDate() + 14);

  const mapped = rows
    .map((r) => {
      const p = r.properties || {};
      const closeDate = propText(p[closeDateKey]) || "";
      const status = propText(p[statusKey]) || "";
      return {
        id: r.id,
        title: propText(p[jobTitleKey]) || propText(p["Name"]) || "",
        company: propText(p[companyKey]) || "",
        url: propText(p[urlKey]) || "",
        status,
        closeDate,
      };
    })
    .filter((item) => {
      if (!item.closeDate) return false;
      const d = new Date(item.closeDate);
      if (Number.isNaN(d.getTime())) return false;
      return d >= now && d <= horizon;
    })
    .sort((a, b) => new Date(a.closeDate) - new Date(b.closeDate));

  return { ok: true, items: mapped };
}

async function isGoogleConnected() {
  try {
    await getAuthToken(false);
    return true;
  } catch (_) {
    return false;
  }
}

async function getDiagnosticsStatus() {
  const syncData = await chrome.storage.sync.get(["notionToken", "notionDbId"]);
  const localData = await chrome.storage.local.get([
    DIAG_SYNC_KEY,
    DIAG_ERRORS_KEY,
    DIAG_LAST_SYNC_KEY,
    OFFLINE_QUEUE_KEY,
  ]);
  const notionConfigured = !!(syncData.notionToken && syncData.notionDbId);
  const googleConnected = await isGoogleConnected();
  const queue = Array.isArray(localData[OFFLINE_QUEUE_KEY]) ? localData[OFFLINE_QUEUE_KEY] : [];
  return {
    ok: true,
    notionConfigured,
    googleConnected,
    lastSyncAt: localData[DIAG_LAST_SYNC_KEY] || null,
    syncStats: localData[DIAG_SYNC_KEY] || {},
    recentErrors: localData[DIAG_ERRORS_KEY] || [],
    offlineQueueCount: queue.length,
  };
}

async function runDiagnosticsTests() {
  const results = {
    notion: { ok: false, message: "Non configurÃ©." },
    google: { ok: false, message: "Non connectÃ©." },
    at: Date.now(),
  };

  const { notionToken: token, notionDbId: dbId } = await chrome.storage.sync.get([
    "notionToken",
    "notionDbId",
  ]);
  if (token && dbId) {
    const normalizedDbId = normalizeDbId(dbId);
    if (normalizedDbId) {
      try {
        const db = await notionFetch(token, `databases/${normalizedDbId}`, "GET");
        const title = (db.title || []).map((t) => t?.plain_text || "").join("").trim();
        results.notion = {
          ok: true,
          message: title ? `OK (${title})` : "OK",
        };
        await recordDiagnosticSync("notionTest", "ok", { dbTitle: title || null });
      } catch (err) {
        const entry = await handleError(err, "Diagnostic Notion", { dbId: normalizedDbId }, {
          syncName: "notionTest",
        });
        results.notion = { ok: false, message: entry.message };
      }
    } else {
      results.notion = { ok: false, message: "ID Notion invalide." };
    }
  }

  try {
    const connected = await isGoogleConnected();
    if (connected) {
      await gcalFetch("users/me/calendarList?maxResults=1", false);
      results.google = { ok: true, message: "OK" };
      await recordDiagnosticSync("googleTest", "ok", { connected: true });
    } else {
      results.google = { ok: false, message: "Non connectÃ©." };
    }
  } catch (err) {
    const entry = await handleError(err, "Diagnostic Google Calendar", null, {
      syncName: "googleTest",
    });
    results.google = { ok: false, message: entry.message };
  }

  return { ok: true, results };
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === "UPSERT_NOTION") {
    return respondWith(upsertToNotion(msg.payload), sendResponse, "Notion - upsert", {
      notify: true,
      syncName: "notionUpsert",
      meta: { url: msg?.payload?.url || null },
    });
  }

  if (msg?.type === "CHECK_NOTION_DB") {
    return respondWith(checkDbAndLoad(), sendResponse, "Notion - vÃ©rification base", {
      syncName: "notionCheck",
      successDetails: (r) => ({
        rows: r?.total ?? (Array.isArray(r?.rows) ? r.rows.length : null),
        columns: Array.isArray(r?.columns) ? r.columns.length : null,
      }),
    });
  }

  if (msg?.type === "GET_OPEN_STAGES") {
    return respondWith(listOpenStages(), sendResponse, "Notion - stages ouverts", {
      syncName: "notionOpenStages",
      successDetails: (r) => ({
        total: r?.total ?? null,
        capped: !!r?.capped,
      }),
    });
  }

  if (msg?.type === "GET_TODO_STAGES") {
    return respondWith(listTodoStages(), sendResponse, "Notion - stages Ã  faire", {
      syncName: "notionTodoStages",
      successDetails: (r) => ({
        total: r?.total ?? null,
        capped: !!r?.capped,
      }),
    });
  }

  if (msg?.type === "GET_STAGE_STATUS_STATS") {
    return respondWith(getStageStatusStats(), sendResponse, "Notion - stats stages", {
      syncName: "notionStageStats",
      successDetails: (r) => ({
        total: r?.total ?? null,
        capped: !!r?.capped,
      }),
    });
  }

  if (msg?.type === "GET_STAGE_DEADLINES") {
    return respondWith(listStageDeadlines(), sendResponse, "Notion - deadlines stages", {
      syncName: "notionStageDeadlines",
    });
  }

  if (msg?.type === "URL_BLOCKER_RECHECK") {
    return respondWith(
      applyUrlBlockerRules().then(() => checkAllTabsForBlocker()).then(() => ({ ok: true })),
      sendResponse,
      "URL Blocker - recheck"
    );
  }

  if (msg?.type === "GCAL_LIST_CALENDARS") {
    return respondWith(
      listCalendars(false).then((items) => ({ ok: true, items })),
      sendResponse,
      "Google Calendar - liste calendriers",
      {
        syncName: "gcalCalendars",
        successDetails: (r) => ({
          calendars: Array.isArray(r?.items) ? r.items.length : 0,
        }),
      }
    );
  }

  if (msg?.type === "GCAL_LOAD_EVENTS") {
    const { timeMin, timeMax, calendarIds } = msg.payload || {};
    return respondWith(
      loadEventsRange(timeMin, timeMax, calendarIds, false).then((events) => ({
        ok: true,
        events,
      })),
      sendResponse,
      "Google Calendar - chargement Ã©vÃ©nements",
      {
        syncName: "gcalEvents",
        meta: { timeMin, timeMax, calendarIds: calendarIds || [] },
      }
    );
  }

  if (msg?.type === "GCAL_CLEAR_EVENT_CACHE") {
    return respondWith(
      chrome.storage.local.remove([GCAL_CACHE_KEY, GCAL_NOTIFIED_KEY]).then(() => ({
        ok: true,
      })),
      sendResponse,
      "Google Calendar - clear cache",
      { syncName: "gcalEvents" }
    );
  }

  if (msg?.type === "GCAL_CONNECT") {
    return respondWith(
      getAuthToken(true).then(() => ({ ok: true })),
      sendResponse,
      "Google Calendar - connexion",
      {
        syncName: "googleAuth",
        successDetails: () => ({ connected: true }),
      }
    );
  }

  if (msg?.type === "GCAL_AUTH_STATUS") {
    getAuthToken(false)
      .then(() => sendResponse({ ok: true, connected: true }))
      .catch(() => sendResponse({ ok: true, connected: false }));
    return true;
  }

  if (msg?.type === "GCAL_LOGOUT") {
  (async () => {
    try {
      // Try to revoke the current token so Google stops issuing it silently.
      let tokenToRevoke = null;
      try {
        tokenToRevoke = await getAuthToken(false);
      } catch (_) {
        tokenToRevoke = null;
      }

      if (tokenToRevoke) {
        try {
          const revokeUrl = `https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(
            tokenToRevoke
          )}`;
          await fetch(revokeUrl, {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
          });
        } catch (_) {
          // Even if revoke fails, we still clear the cached tokens.
        }
      }

      if (typeof chrome.identity.clearAllCachedAuthTokens === "function") {
        await new Promise((resolve) => chrome.identity.clearAllCachedAuthTokens(resolve));
      } else if (tokenToRevoke) {
        await new Promise((resolve) =>
          chrome.identity.removeCachedAuthToken({ token: tokenToRevoke }, resolve)
        );
      }

      // Clear local Calendar-related state so the UI reflects the logout immediately.
      await chrome.storage.local.remove([
        "gcalEventCache",
        "gcalEventMap",
        "gcalNotified",
        "gcalSelectedCalendars",
        "gcalNotifyCalendars",
      ]);

      await recordDiagnosticSync("googleAuth", "ok", { connected: false, loggedOut: true });
      sendResponse({ ok: true });
    } catch (err) {
      const entry = await handleError(err, "Google Calendar - déconnexion", null, {
        syncName: "googleAuth",
      });
      sendResponse({ ok: false, error: entry.message, code: entry.code });
    }
  })();
  return true;
}

  if (msg?.type === "GCAL_CREATE_EVENT") {
    const { calendarId, event } = msg.payload || {};
    if (!calendarId || !event) {
      sendResponse({ ok: false, error: "Missing calendarId or event." });
      return true;
    }
    return respondWith(
      createCalendarEvent(calendarId, event).then((created) => ({ ok: true, event: created })),
      sendResponse,
      "Google Calendar - crÃ©ation Ã©vÃ©nement",
      {
        syncName: "gcalCreateEvent",
        meta: { calendarId },
        successDetails: (r) => ({
          calendarId,
          eventId: r?.event?.id || null,
        }),
      }
    );
  }

  if (msg?.type === "GCAL_UPDATE_EVENT") {
    const { calendarId, eventId, patch, sendUpdates } = msg.payload || {};
    if (!calendarId || !eventId || !patch) {
      sendResponse({ ok: false, error: "Missing calendarId, eventId or patch." });
      return true;
    }
    return respondWith(
      updateCalendarEvent(calendarId, eventId, patch, sendUpdates || "all").then((event) => ({
        ok: true,
        event,
      })),
      sendResponse,
      "Google Calendar - mise à jour événement",
      {
        syncName: "gcalUpdateEvent",
        meta: { calendarId, eventId },
        successDetails: () => ({ calendarId, eventId }),
      }
    );
  }

  if (msg?.type === "GCAL_DELETE_EVENT") {
    const { calendarId, eventId, sendUpdates } = msg.payload || {};
    if (!calendarId || !eventId) {
      sendResponse({ ok: false, error: "Missing calendarId or eventId." });
      return true;
    }
    return respondWith(
      deleteCalendarEvent(calendarId, eventId, sendUpdates || "all").then(() => ({ ok: true })),
      sendResponse,
      "Google Calendar - suppression événement",
      {
        syncName: "gcalDeleteEvent",
        meta: { calendarId, eventId },
        successDetails: () => ({ calendarId, eventId }),
      }
    );
  }

  if (msg?.type === "GCAL_CREATE_EVENT_WITH_INVITES") {
    const { calendarId, event } = msg.payload || {};
    return respondWith(
      createCalendarEventWithInvites(calendarId, event),
      sendResponse,
      "Google Calendar - crÃ©ation + invitations",
      {
        notify: true,
        syncName: "gcalCreateEventWithInvites",
        meta: { calendarId },
        successDetails: (r) => ({
          calendarId,
          eventId: r?.event?.id || null,
          attendees: Array.isArray(r?.event?.attendees) ? r.event.attendees.length : 0,
          meet: !!r?.event?.hangoutLink,
        }),
      }
    );
  }

  if (msg?.type === "PLACES_AUTOCOMPLETE") {
    const { input } = msg.payload || {};
    return respondWith(
      placesAutocomplete(input),
      sendResponse,
      "Google Places - autocomplete"
    );
  }

  if (msg?.type === "PLACES_GEOCODE") {
    const { address } = msg.payload || {};
    return respondWith(
      placesGeocode(address),
      sendResponse,
      "Google Places - geocode"
    );
  }

  if (msg?.type === "NOTION_SYNC_NOW") {
    return respondWith(syncNotionToCalendar(), sendResponse, "Sync Notion â†’ Calendar", {
      notify: true,
      syncName: "notionToCalendar",
    });
  }

  if (msg?.type === "NOTION_SYNC_STATUS") {
    chrome.storage.local.get([NOTION_SYNC_KEY], (data) => {
      sendResponse({ ok: true, enabled: !!data[NOTION_SYNC_KEY] });
    });
    return true;
  }

  if (msg?.type === "NOTION_SYNC_SET") {
    const enabled = !!msg.payload?.enabled;
    chrome.storage.local.set({ [NOTION_SYNC_KEY]: enabled }, () => {
      sendResponse({ ok: true });
    });
    return true;
  }

  if (msg?.type === "DEADLINE_GET_PREFS") {
    chrome.storage.local.get([DEADLINE_PREFS_KEY], (data) => {
      sendResponse({ ok: true, prefs: data[DEADLINE_PREFS_KEY] });
    });
    return true;
  }

  if (msg?.type === "DEADLINE_SET_PREFS") {
    const prefs = msg.payload || {};
    chrome.storage.local.set({ [DEADLINE_PREFS_KEY]: prefs }, () => {
      sendResponse({ ok: true });
    });
    return true;
  }

  if (msg?.type === "OFFLINE_QUEUE_STATUS") {
    chrome.storage.local.get([OFFLINE_QUEUE_KEY], (data) => {
      const items = Array.isArray(data[OFFLINE_QUEUE_KEY]) ? data[OFFLINE_QUEUE_KEY] : [];
      sendResponse({ ok: true, count: items.length });
    });
    return true;
  }

  if (msg?.type === "GCAL_GET_NOTIFY_PREFS") {
    chrome.storage.local.get([GCAL_NOTIFY_TOGGLE_KEY], (data) => {
      sendResponse({ ok: true, ids: data[GCAL_NOTIFY_TOGGLE_KEY] || [] });
    });
    return true;
  }

  if (msg?.type === "GCAL_SET_NOTIFY_PREFS") {
    const ids = Array.isArray(msg.payload?.ids) ? msg.payload.ids : [];
    chrome.storage.local.set({ [GCAL_NOTIFY_TOGGLE_KEY]: ids }, () => {
      sendResponse({ ok: true });
    });
    return true;
  }

  if (msg?.type === "GET_YAHOO_NEWS") {
    return respondWith(
      getYahooNews(false).then((data) => ({ ok: true, data })),
      sendResponse,
      "Yahoo News",
      { syncName: "yahooNews" }
    );
  }

  if (msg?.type === "REFRESH_YAHOO_NEWS") {
    return respondWith(
      getYahooNews(true).then((data) => ({ ok: true, data })),
      sendResponse,
      "Yahoo News - rafraÃ®chissement",
      { syncName: "yahooNews" }
    );
  }

  if (msg?.type === "GET_YAHOO_QUOTES") {
    const symbols = msg.payload?.symbols || [];
    const force = !!msg.payload?.force;
    return respondWith(
      getYahooQuotes(symbols, force).then((data) => ({ ok: true, data })),
      sendResponse,
      "Yahoo Quotes",
      { syncName: "yahooQuotes", meta: { symbols } }
    );
  }

  if (msg?.type === "GET_ECB_FR10Y") {
    const force = !!msg.payload?.force;
    return respondWith(
      getEcbFr10y(force).then((data) => ({ ok: true, data })),
      sendResponse,
      "Banque de France FR10Y",
      { syncName: "ecbFr10y" }
    );
  }

  if (msg?.type === "GET_YAHOO_PREFS") {
    return respondWith(
      getYahooPrefs().then((prefs) => ({ ok: true, prefs })),
      sendResponse,
      "Yahoo Prefs",
      { syncName: "yahooPrefs" }
    );
  }

  if (msg?.type === "SET_YAHOO_PREFS") {
    const prefs = msg.payload || {};
    chrome.storage.local.set({ yahooNewsPrefs: prefs }, () => {
      sendResponse({ ok: true });
    });
    return true;
  }

  if (msg?.type === "DIAG_GET_STATUS") {
    return respondWith(getDiagnosticsStatus(), sendResponse, "Diagnostic - statut");
  }

  if (msg?.type === "DIAG_RUN_TESTS") {
    return respondWith(
      (async () => {
        const tests = await runDiagnosticsTests();
        const status = await getDiagnosticsStatus();
        return { ...status, tests: tests.results };
      })(),
      sendResponse,
      "Diagnostic - tests"
    );
  }

  if (msg?.type === "DIAG_CLEAR_ERRORS") {
    return respondWith(
      chrome.storage.local.set({ [DIAG_ERRORS_KEY]: [] }).then(() => ({ ok: true })),
      sendResponse,
      "Diagnostic - reset erreurs"
    );
  }

  sendResponse({ ok: false, error: "Message inconnu." });
  return true;
});

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (!alarm?.name) return;
  if (alarm.name === GCAL_SYNC_ALARM) {
    const now = new Date();
    const timeMin = toIsoStringLocal(now);
    const timeMax = toIsoStringLocal(new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000));
    const { gcalSelectedCalendars } = await chrome.storage.local.get(["gcalSelectedCalendars"]);
    const ids = Array.isArray(gcalSelectedCalendars) ? gcalSelectedCalendars : [];
    try {
      await loadEventsRange(timeMin, timeMax, ids, false);
    } catch (err) {
      await handleError(err, "Alarme Google Calendar sync", { timeMin, timeMax }, {
        syncName: "gcalEvents",
      });
    }
    return;
  }

  if (alarm.name.startsWith(DEADLINE_ALARM_PREFIX)) {
    chrome.storage.local.get([alarm.name], (data) => {
      const info = data[alarm.name];
      if (!info) return;
      const title = `Deadline dans ${info.hours}h`;
      const message = `${info.summary} (${info.date})`;
      chrome.notifications.create(alarm.name, {
        type: "basic",
        iconUrl: "icons/icon-128.png",
        title,
        message,
        priority: 2,
      });
    });
    return;
  }

  if (alarm.name === YAHOO_NEWS_ALARM) {
    try {
      await getYahooNews(true);
    } catch (err) {
      await handleError(err, "Alarme Yahoo News", null, { syncName: "yahooNews" });
    }
    return;
  }

  if (alarm.name === NOTION_SYNC_ALARM) {
    const { [NOTION_SYNC_KEY]: enabled } = await chrome.storage.local.get([NOTION_SYNC_KEY]);
    if (!enabled) return;
    try {
      await syncNotionToCalendar();
    } catch (err) {
      await handleError(err, "Alarme Sync Notion â†’ Calendar", null, {
        syncName: "notionToCalendar",
      });
    }
    return;
  }

  if (!alarm.name.startsWith(GCAL_ALARM_PREFIX)) return;
  const { gcalEventMap, gcalNotified } = await chrome.storage.local.get([
    "gcalEventMap",
    "gcalNotified",
  ]);
  const data = gcalEventMap?.[alarm.name];
  if (!data) return;

  const notified = gcalNotified || {};
  const key = alarm.name;
  if (notified[key]) return;

  const now = Date.now();
  const startMs = data.start ? new Date(data.start).getTime() : null;
  if (!startMs || now > startMs + GCAL_NOTIFY_WINDOW_MIN * 60 * 1000) {
    return;
  }

  const startText = data.start ? new Date(data.start).toLocaleString() : "";
  const title = data.summary || "Evenement";
  const message = startText ? `Commence a ${startText}` : "Evenement a venir";

  chrome.notifications.create(alarm.name, {
    type: "basic",
    iconUrl: "icons/icon-128.png",
    title,
    message,
    priority: 2,
  });

  notified[key] = Date.now();
  await chrome.storage.local.set({ gcalNotified: notified });
});

async function flushOfflineQueue() {
  const { [OFFLINE_QUEUE_KEY]: queue } = await chrome.storage.local.get([OFFLINE_QUEUE_KEY]);
  const items = Array.isArray(queue) ? queue : [];
  if (!items.length) return;

  const remaining = [];
  for (const item of items) {
    try {
      await upsertToNotion(item.payload);
    } catch (err) {
      await handleError(err, "Flush file d'attente offline", null, {
        syncName: "offlineQueue",
      });
      remaining.push(item);
    }
  }
  await chrome.storage.local.set({ [OFFLINE_QUEUE_KEY]: remaining });
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.alarms.create(GCAL_SYNC_ALARM, { periodInMinutes: 15 });
  chrome.alarms.create(YAHOO_NEWS_ALARM, { periodInMinutes: 15 });
  chrome.alarms.create(NOTION_SYNC_ALARM, { periodInMinutes: 60 });
  flushOfflineQueue();
  ensureUrlBlockerDefaults().then(() => applyUrlBlockerRules()).then(checkAllTabsForBlocker);
});

chrome.runtime.onStartup.addListener(() => {
  chrome.alarms.create(GCAL_SYNC_ALARM, { periodInMinutes: 15 });
  chrome.alarms.create(YAHOO_NEWS_ALARM, { periodInMinutes: 15 });
  chrome.alarms.create(NOTION_SYNC_ALARM, { periodInMinutes: 60 });
  flushOfflineQueue();
  ensureUrlBlockerDefaults().then(() => applyUrlBlockerRules()).then(checkAllTabsForBlocker);
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return;
  if (changes[URL_BLOCKER_RULES_KEY] || changes[URL_BLOCKER_ENABLED_KEY]) {
    applyUrlBlockerRules().then(checkAllTabsForBlocker);
  }
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (!changeInfo.url) return;
  chrome.storage.local
    .get([URL_BLOCKER_RULES_KEY, URL_BLOCKER_ENABLED_KEY])
    .then((data) => {
      if (data[URL_BLOCKER_ENABLED_KEY] === false) return;
      const filters = normalizeUrlBlockerRules(data[URL_BLOCKER_RULES_KEY] || []);
      if (!filters.length) return;
      if (shouldBlockUrl(changeInfo.url, filters)) {
        chrome.tabs.remove(tabId).catch(() => {});
      }
    })
    .catch(() => {});
});

