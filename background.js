try {
  importScripts("config.js");
} catch (_) {
  // No defaults file present.
}

const EXTENSION_DEFAULTS = self?.EXTENSION_DEFAULTS || null;
const NOTION_VERSION = "2022-06-28";
const MAX_LIST_ROWS = Number.POSITIVE_INFINITY;
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
const GCAL_REMINDER_PREFS_KEY = "gcalReminderPrefs";
const GCAL_SNOOZE_ALARM_PREFIX = "gcal-snooze|";
const YAHOO_NEWS_ALARM = "yahoo-news-sync";
const YAHOO_NEWS_URL = "https://feeds.finance.yahoo.com/rss/2.0/headline";
const YAHOO_NEWS_CACHE_MIN = 15;
const TAG_RULES_KEY = "autoTagRules";
const NOTION_SYNC_ALARM = "notion-calendar-sync";
const NOTION_SYNC_KEY = "notionCalendarSyncEnabled";
const NOTION_SYNC_MAP = "notionCalendarMap";
const DEADLINE_PREFS_KEY = "deadlinePrefs";
const DEADLINE_ALARM_PREFIX = "deadline|";
const INTERVIEW_ALARM_PREFIX = "interview|";
const OFFLINE_QUEUE_KEY = "offlineQueue";
const YAHOO_CHART_URL = "https://query1.finance.yahoo.com/v8/finance/chart";
const YAHOO_QUOTE_CACHE_MIN = 5;
const ECB_FR10Y_URL =
  "https://webstat.banque-france.fr/api/explore/v2.1/catalog/datasets/observations/exports/json/?where=series_key+IN+%28%22FM.D.FR.EUR.FR2.BB.FRMOYTEC10.HSTA%22%29&order_by=-time_period_start";
const ECB_CACHE_KEY = "ecbFr10yCache";
const ECB_CACHE_TTL_MS = 60 * 60 * 1000;
const BDF_API_KEY_KEY = "bdfApiKey";
const GOOGLE_PLACES_KEY_KEY = "googlePlacesApiKey";
const STAGE_STATS_CACHE_KEY = "stageStatsCache";
const STAGE_STATS_CACHE_TTL_MS = 5 * 60 * 1000;
const STAGE_DASHBOARD_SNAPSHOT_KEY = "stageDashboardSnapshot";
const STAGE_SCHEMA_CACHE_KEY = "stageSchemaCache";
const STAGE_DASHBOARD_TTL_MS = 90 * 1000;
const STAGE_SCHEMA_TTL_MS = 60 * 60 * 1000;
const STAGE_DATA_SYNC_ALARM = "stage-data-sync";
const STAGE_SLA_OPEN_DAYS = 7;
const STAGE_SLA_APPLIED_DAYS = 10;
const STAGE_SLA_ALARM = "stage-sla-check";
const DIAG_ERRORS_KEY = "diagErrors";
const DIAG_ERRORS_LIMIT = 25;
const DIAG_SYNC_KEY = "diagSyncStats";
const DIAG_LAST_SYNC_KEY = "diagLastSyncAt";
const URL_BLOCKER_RULES_KEY = "urlBlockerRules";
const URL_BLOCKER_ENABLED_KEY = "urlBlockerEnabled";
const URL_BLOCKER_BASE_ID = 9000;

let stageSnapshotInFlight = null;
let stageSnapshotRefreshTimer = null;

try {
  if (chrome?.sidePanel?.setPanelBehavior) {
    chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
  }
} catch (_) {
  // Ignore if side panel API is unavailable.
}

function buildSeedPayload(defaults, current) {
  const payload = {};
  if (!defaults || typeof defaults !== "object") return payload;
  const hasOwn = Object.prototype.hasOwnProperty;
  Object.keys(defaults).forEach((key) => {
    if (!hasOwn.call(current, key) || current[key] === undefined) {
      payload[key] = defaults[key];
    }
  });
  return payload;
}

async function seedDefaultConfig() {
  if (!EXTENSION_DEFAULTS) return;
  const syncDefaults = EXTENSION_DEFAULTS.sync || {};
  const localDefaults = EXTENSION_DEFAULTS.local || {};
  const syncKeys = Object.keys(syncDefaults);
  const localKeys = Object.keys(localDefaults);

  if (syncKeys.length) {
    const currentSync = await chrome.storage.sync.get(syncKeys);
    const toSetSync = buildSeedPayload(syncDefaults, currentSync);
    if (Object.keys(toSetSync).length) {
      await chrome.storage.sync.set(toSetSync);
    }
  }

  if (localKeys.length) {
    const currentLocal = await chrome.storage.local.get(localKeys);
    const toSetLocal = buildSeedPayload(localDefaults, currentLocal);
    if (Object.keys(toSetLocal).length) {
      await chrome.storage.local.set(toSetLocal);
    }
  }
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
      return "Base Notion introuvable. Verifie l'ID et le partage.";
    case "NETWORK_ERROR":
      return "Erreur reseau. Verifie ta connexion et reessaie.";
    case "HTTP_404":
      return "Ressource introuvable (404).";
    case "HTTP_429":
      return "Trop de requetes (429). Reessaie dans quelques instants.";
    case "HTTP_5XX":
      return "Service indisponible cote serveur. Reessaie plus tard.";
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
        "Base Notion introuvable (verifie l'ID et le partage).",
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

function isoDatePlusDays(days) {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() + Number(days || 0));
  return d.toISOString().slice(0, 10);
}

function parseDateFromAny(value) {
  if (!value) return null;
  const iso = String(value).match(/\b\d{4}-\d{2}-\d{2}\b/);
  if (iso) {
    const d = new Date(`${iso[0]}T12:00:00`);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function extractDateCandidatesFromText(value) {
  const text = normalizeText(value || "");
  if (!text) return [];
  const found = [];
  const isoMatches = text.match(/\b\d{4}-\d{2}-\d{2}\b/g) || [];
  const frMatches = text.match(/\b\d{1,2}[\/.-]\d{1,2}[\/.-]\d{2,4}\b/g) || [];
  [...isoMatches, ...frMatches].forEach((m) => {
    const normalized = m.replace(/[.]/g, "/");
    const dmy = normalized.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
    if (dmy) {
      const day = dmy[1].padStart(2, "0");
      const month = dmy[2].padStart(2, "0");
      let year = dmy[3];
      if (year.length === 2) year = `20${year}`;
      found.push(`${year}-${month}-${day}`);
      return;
    }
    const d = parseDateFromAny(normalized);
    if (d) found.push(d.toISOString().slice(0, 10));
  });
  return Array.from(new Set(found));
}

function startOfWeek(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay();
  const diff = (day + 6) % 7;
  d.setDate(d.getDate() - diff);
  return d;
}

function isDateInCurrentWeek(input) {
  const d = parseDateFromAny(input);
  if (!d) return false;
  const now = new Date();
  const start = startOfWeek(now);
  const end = new Date(start);
  end.setDate(end.getDate() + 7);
  return d >= start && d < end;
}

function normalizeStageStatusForAutomation(value) {
  const v = normalizeText(value || "").toLowerCase();
  if (!v) return "ouvert";
  if (v.startsWith("ouv")) return "ouvert";
  if (v.includes("refus") || v.includes("recal")) return "refuse";
  if (v.includes("candid") || v.includes("postul") || v.includes("envoy")) return "candidature";
  if (v.includes("entre") || v.includes("interview")) return "entretien";
  return v;
}

function isStrictOpenStageStatus(value) {
  return normalizeText(value || "").toLowerCase() === "ouvert";
}

function normalizeCompareText(value) {
  return normalizeText(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function diceCoefficient(a, b) {
  const x = normalizeCompareText(a);
  const y = normalizeCompareText(b);
  if (!x || !y) return 0;
  if (x === y) return 1;
  if (x.length < 2 || y.length < 2) return x === y ? 1 : 0;

  const grams = new Map();
  for (let i = 0; i < x.length - 1; i += 1) {
    const gram = x.slice(i, i + 2);
    grams.set(gram, (grams.get(gram) || 0) + 1);
  }
  let overlap = 0;
  for (let i = 0; i < y.length - 1; i += 1) {
    const gram = y.slice(i, i + 2);
    const count = grams.get(gram) || 0;
    if (count > 0) {
      overlap += 1;
      grams.set(gram, count - 1);
    }
  }
  return (2 * overlap) / (x.length + y.length - 2);
}

function sameUrl(a, b) {
  const canonicalize = (input) => {
    const u = new URL(input);
    u.hash = "";
    const kept = [];
    u.searchParams.forEach((v, k) => {
      if (/^utm_/i.test(k)) return;
      if (k.toLowerCase() === "trk") return;
      kept.push([k, v]);
    });
    kept.sort((x, y) => x[0].localeCompare(y[0]));
    u.search = "";
    kept.forEach(([k, v]) => u.searchParams.append(k, v));
    return u.toString().replace(/\/$/, "");
  };
  try {
    return canonicalize(a) === canonicalize(b);
  } catch (_) {
    return normalizeText(a) === normalizeText(b);
  }
}

function inferCompanyFromUrl(url) {
  if (!url) return "";
  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    const parts = host.split(".");
    const core = parts.length >= 2 ? parts[parts.length - 2] : host;
    return core.charAt(0).toUpperCase() + core.slice(1);
  } catch (_) {
    return "";
  }
}

function suggestDeadlineFromStageData(stageTitle, stageUrl, notes) {
  const candidates = [
    ...extractDateCandidatesFromText(stageTitle),
    ...extractDateCandidatesFromText(stageUrl),
    ...extractDateCandidatesFromText(notes),
  ];
  if (!candidates.length) return "";
  const today = todayISODate();
  const upcoming = candidates
    .filter((d) => d >= today)
    .sort((a, b) => new Date(a).getTime() - new Date(b).getTime());
  return upcoming[0] || "";
}

function defaultReminderPrefs() {
  return {
    default: [30],
    meeting: [30],
    entretien: [120, 30],
    deadline: [24 * 60, 60],
  };
}

function normalizeReminderPrefs(raw) {
  const base = defaultReminderPrefs();
  const out = { ...base };
  const src = raw && typeof raw === "object" ? raw : {};
  Object.keys(base).forEach((key) => {
    const arr = Array.isArray(src[key]) ? src[key] : base[key];
    const clean = arr
      .map((n) => Number.parseInt(n, 10))
      .filter((n) => Number.isFinite(n) && n > 0)
      .slice(0, 4);
    out[key] = clean.length ? clean : base[key];
  });
  return out;
}

function classifyCalendarEventType(event) {
  const text = `${event?.summary || ""} ${event?.description || ""} ${event?.location || ""}`.toLowerCase();
  if (/deadline|due|date limite|closing/i.test(text)) return "deadline";
  if (/entretien|interview/i.test(text)) return "entretien";
  const meetingLink = extractMeetingLink(event);
  if (meetingLink) return "meeting";
  return "default";
}

function buildGcalAlarmName(eventKey, minutesBefore) {
  return `${GCAL_ALARM_PREFIX}${eventKey}|m${minutesBefore}`;
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

let gcalInteractiveConnectPromise = null;

function isAuthUserCancellationError(message) {
  const text = String(message || "").toLowerCase();
  return /user did not approve|user cancelled|user canceled|access_denied|denied|cancelled|canceled|closed by user/.test(
    text
  );
}

async function getAuthTokenRaw(interactive) {
  return new Promise((resolve, reject) => {
    chrome.identity.getAuthToken({ interactive: !!interactive }, (token) => {
      if (chrome.runtime.lastError) {
        reject(makeError(chrome.runtime.lastError.message, "AUTH_REQUIRED"));
        return;
      }
      if (!token) {
        reject(makeError("Aucun token Google recu.", "AUTH_REQUIRED"));
        return;
      }
      resolve(token);
    });
  });
}

async function clearCachedGoogleTokens(tokenToRemove) {
  try {
    if (typeof chrome.identity.clearAllCachedAuthTokens === "function") {
      await new Promise((resolve) => chrome.identity.clearAllCachedAuthTokens(resolve));
      return;
    }
  } catch (_) {
    // Fallback below if API is unavailable.
  }
  if (tokenToRemove) {
    try {
      await new Promise((resolve) =>
        chrome.identity.removeCachedAuthToken({ token: tokenToRemove }, resolve)
      );
    } catch (_) {
      // Ignore cache cleanup failure.
    }
  }
}

async function getAuthToken(interactive, options = {}) {
  const wantsInteractive = !!interactive;
  const requestedAttempts = Number.parseInt(options?.attempts, 10);
  const maxAttempts =
    Number.isFinite(requestedAttempts) && requestedAttempts > 0
      ? requestedAttempts
      : wantsInteractive
        ? 2
        : 1;
  let lastErr = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await getAuthTokenRaw(wantsInteractive);
    } catch (err) {
      lastErr = err;
      if (!wantsInteractive) break;
      if (attempt >= maxAttempts) break;
      if (isAuthUserCancellationError(err?.message)) break;
      await clearCachedGoogleTokens();
    }
  }

  throw lastErr || makeError("Authentification Google requise.", "AUTH_REQUIRED");
}

async function verifyGoogleToken(token) {
  const { status } = await safeFetch(
    `${GCAL_BASE}/users/me/calendarList?maxResults=1`,
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
    "Google Calendar - verification token",
    [401, 403]
  );
  if (status === 401 || status === 403) {
    throw makeError("Authentification Google requise.", "AUTH_REQUIRED", status);
  }
}

async function connectGoogleInteractive() {
  if (gcalInteractiveConnectPromise) return gcalInteractiveConnectPromise;

  gcalInteractiveConnectPromise = (async () => {
    let token = await getAuthToken(true, { attempts: 2 });
    try {
      await verifyGoogleToken(token);
    } catch (err) {
      const code = err?.code || classifyError(err?.message, err?.status);
      if (code !== "AUTH_REQUIRED") throw err;
      await clearCachedGoogleTokens(token);
      token = await getAuthToken(true, { attempts: 1 });
      await verifyGoogleToken(token);
    }
    return { ok: true };
  })();

  try {
    return await gcalInteractiveConnectPromise;
  } finally {
    gcalInteractiveConnectPromise = null;
  }
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
    throw makeError("Cl? Google Places manquante (Options).", "PLACES_KEY_MISSING");
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
          const changePercentRaw = result?.meta?.regularMarketChangePercent;
          const prevClose =
            result?.meta?.previousClose ??
            result?.meta?.regularMarketPreviousClose ??
            result?.meta?.chartPreviousClose;
          let changePercent = Number.isFinite(changePercentRaw) ? changePercentRaw : null;
          if (changePercent == null && Number.isFinite(price) && Number.isFinite(prevClose) && prevClose) {
            changePercent = ((price - prevClose) / prevClose) * 100;
          }
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
      throw makeError("Titre d'evenement manquant.", "GCAL_SUMMARY_MISSING");
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
    await handleError(err, "Google Calendar - creation + invitations", { calendarId }, {
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
    const syncMap = normalizeSyncMap(storedMap);
    let createdCount = 0;
    let updatedCount = 0;

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

      const summary = [company, title].filter(Boolean).join(" - ") || "Stage";
      const description = `${url || ""}\nnotion:${r.id}`.trim();
      const eventPayload = {
        summary,
        description,
        start: { date },
        end: { date },
      };

      const existing = syncMap.pages[r.id];
      if (existing?.eventId) {
        try {
          await updateCalendarEvent(existing.calendarId || calendarId, existing.eventId, eventPayload);
          syncMap.pages[r.id] = {
            eventId: existing.eventId,
            calendarId: existing.calendarId || calendarId,
            date,
            updatedAt: Date.now(),
          };
          syncMap.events[existing.eventId] = r.id;
          updatedCount += 1;
        } catch (err) {
          const created = await createCalendarEvent(calendarId, eventPayload);
          syncMap.pages[r.id] = {
            eventId: created.id,
            calendarId,
            date,
            createdAt: Date.now(),
          };
          syncMap.events[created.id] = r.id;
          createdCount += 1;
        }
      } else {
        const created = await createCalendarEvent(calendarId, eventPayload);
        syncMap.pages[r.id] = {
          eventId: created.id,
          calendarId,
          date,
          createdAt: Date.now(),
        };
        syncMap.events[created.id] = r.id;
        createdCount += 1;
      }
    }

    // Calendar -> Notion: update date if event changed.
    const now = new Date();
    const timeMin = toIsoStringLocal(new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000));
    const timeMax = toIsoStringLocal(new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000));
    const events = await listCalendarEvents(calendarId, timeMin, timeMax, false);
    const db = await notionFetch(token, `databases/${normalizedDbId}`, "GET");
    const closeDateKey = map.closeDate || map.openDate || map.startMonth || "Date de fermeture";
    const dateProp = db.properties?.[closeDateKey];

    for (const ev of events) {
      const desc = ev.description || "";
      const match = desc.match(/notion:([0-9a-fA-F-]+)/);
      const pageId = match?.[1] || syncMap.events[ev.id];
      if (!pageId) continue;
      const evDate = (ev.start?.date || ev.start?.dateTime || "").slice(0, 10);
      if (!evDate) continue;
      const current = syncMap.pages[pageId];
      if (current?.date === evDate) continue;
      if (!dateProp) continue;
      const properties =
        dateProp.type === "date"
          ? { [closeDateKey]: { date: { start: evDate } } }
          : { [closeDateKey]: { rich_text: [{ text: { content: evDate } }] } };
      await notionFetch(token, `pages/${pageId}`, "PATCH", { properties });
      syncMap.pages[pageId] = {
        eventId: ev.id,
        calendarId,
        date: evDate,
        updatedAt: Date.now(),
      };
      syncMap.events[ev.id] = pageId;
    }

    await chrome.storage.local.set({ [NOTION_SYNC_MAP]: syncMap });
    await recordDiagnosticSync(syncName, "ok", {
      created: createdCount,
      updated: updatedCount,
      scanned: rows.length,
      calendarId,
      statusMapApplied: !!statusMap,
    });
    return { ok: true, created: createdCount, updated: updatedCount, scanned: rows.length };
  } catch (err) {
    await handleError(err, "Sync Notion -> Calendar", null, {
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
  const { gcalEventMap, gcalNotifyCalendars, [GCAL_REMINDER_PREFS_KEY]: rawReminderPrefs } =
    await chrome.storage.local.get([
    "gcalEventMap",
    "gcalNotifyCalendars",
    GCAL_REMINDER_PREFS_KEY,
  ]);
  const map = gcalEventMap || {};
  const reminderPrefs = normalizeReminderPrefs(rawReminderPrefs);
  const now = Date.now();
  const notifyEnabled = Array.isArray(gcalNotifyCalendars) ? gcalNotifyCalendars : null;

  for (const item of eventsByCalendar) {
    const { calendarId, calendarSummary, events } = item;
    if (notifyEnabled && !notifyEnabled.includes(calendarId)) continue;
    for (const ev of events) {
      const start = eventStartDate(ev);
      if (!start) continue;
      const eventKey = makeEventKey(calendarId, ev);
      const eventType = classifyCalendarEventType(ev);
      const offsets = reminderPrefs[eventType] || reminderPrefs.default || [GCAL_NOTIFY_MINUTES];
      const link = extractMeetingLink(ev) || ev.htmlLink || ev.source?.url || "";

      offsets.forEach((minutesBefore) => {
        const alarmTime = start.getTime() - minutesBefore * 60 * 1000;
        if (alarmTime <= now) return;
        const alarmName = buildGcalAlarmName(eventKey, minutesBefore);
        map[alarmName] = {
          calendarId,
          calendarSummary,
          eventId: ev.id,
          summary: ev.summary || "Evenement",
          start: start.toISOString(),
          minutesBefore,
          link,
          eventType,
        };
        chrome.alarms.create(alarmName, { when: alarmTime });
      });
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
          sourceType: "google",
          eventType: classifyCalendarEventType(ev),
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
      "Google Calendar - chargement des evenements",
      { timeMin, timeMax },
      { syncName }
    );
    throw err;
  }
}

async function scheduleDeadlineAlerts(rows, map) {
  const { deadlinePrefs } = await chrome.storage.local.get([DEADLINE_PREFS_KEY]);
  const prefs = deadlinePrefs || { enabled: true, offsets: [24, 72, 168] };
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

async function findDuplicateStageBySmartMatch(token, dbId, payload, map) {
  const url = normalizeText(payload?.url || "");
  const title = normalizeText(payload?.title || "");
  const company = normalizeText(payload?.company || "");
  if (!url && !title) return null;

  const rows = await listDbRowsLimited(token, dbId, null, 350);
  const jobTitleKey = map.jobTitle || "Job Title";
  const companyKey = map.company || "Entreprise";
  const urlKey = map.url || "lien offre";

  let best = null;
  let bestScore = 0;

  rows.forEach((r) => {
    const p = r.properties || {};
    const rowTitle = propText(p[jobTitleKey]) || propText(p["Name"]) || "";
    const rowCompany = propText(p[companyKey]) || "";
    const rowUrl = propText(p[urlKey]) || "";

    if (url && rowUrl && sameUrl(url, rowUrl)) {
      best = r;
      bestScore = 2;
      return;
    }
    const titleScore = diceCoefficient(title, rowTitle);
    const companyScore = diceCoefficient(company, rowCompany);
    const score = titleScore * 0.7 + companyScore * 0.3;
    const exactPair =
      normalizeCompareText(title) === normalizeCompareText(rowTitle) &&
      normalizeCompareText(company) === normalizeCompareText(rowCompany);
    if (exactPair && score >= bestScore) {
      best = r;
      bestScore = 1.5;
      return;
    }
    if (score > bestScore && score >= 0.86) {
      best = r;
      bestScore = score;
    }
  });

  return best;
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
    let existing = await findByUrl(token, normalizedDbId, payload.url, map);
    if (!existing) {
      existing = await findDuplicateStageBySmartMatch(token, normalizedDbId, payload, map);
    }
    const properties = buildProps(payload, map, statusMap);

    if (existing) {
      await notionFetch(token, `pages/${existing.id}`, "PATCH", { properties });
      await invalidateStageSnapshot();
      scheduleStageSnapshotRefresh(150);
      return { ok: true, mode: "updated" };
    } else {
      await notionFetch(token, "pages", "POST", {
        parent: { database_id: normalizedDbId },
        properties,
      });
      await invalidateStageSnapshot();
      scheduleStageSnapshotRefresh(150);
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

async function listDbRowsLimited(token, dbId, filter, limit = 300) {
  let rows = [];
  let cursor = undefined;
  const safeLimit = Number.isFinite(limit) ? Math.max(1, limit) : 300;

  while (rows.length < safeLimit) {
    const body = { page_size: Math.min(100, safeLimit - rows.length) };
    if (filter) body.filter = filter;
    if (cursor) body.start_cursor = cursor;
    const r = await notionFetch(token, `databases/${dbId}/query`, "POST", body);
    rows = rows.concat(r.results || []);
    if (!r.has_more || !r.next_cursor) break;
    cursor = r.next_cursor;
  }

  return rows.slice(0, safeLimit);
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
    capped: false,
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
    capped: false,
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
    capped: false,
  };
}

async function listAllStages() {
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

  const rows = await listDbRows(token, normalizedDbId, null);
  const mapped = rows.map((r) => {
    const p = r.properties || {};
    const jobTitleKey = map.jobTitle || "Job Title";
    const companyKey = map.company || "Entreprise";
    const urlKey = map.url || "lien offre";
    const statusKeyLocal = map.status || "Status";
    const closeDateKey = map.closeDate || "Date de fermeture";
    const notesKey = map.notes || "Notes";
    return {
      id: r.id,
      title: propText(p[jobTitleKey]) || propText(p["Name"]) || "",
      company: propText(p[companyKey]) || "",
      url: propText(p[urlKey]) || "",
      status: propText(p[statusKeyLocal]) || "",
      closeDate: propText(p[closeDateKey]) || "",
      notes: propText(p[notesKey]) || "",
    };
  });

  return {
    ok: true,
    items: mapped,
    total: rows.length,
    capped: false,
  };
}

async function getStageBlockers() {
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

  const rows = await listDbRowsLimited(token, normalizedDbId, null, 400);
  const statusKey = map.status || "Status";
  const jobTitleKey = map.jobTitle || "Job Title";
  const companyKey = map.company || "Entreprise";
  const urlKey = map.url || "lien offre";
  const blockers = [];
  const now = Date.now();

  rows.forEach((r) => {
    const p = r.properties || {};
    const status = propText(p[statusKey]) || "";
    const kind = normalizeStageStatusForAutomation(status);
    const lastEdited = new Date(r.last_edited_time || r.created_time || 0).getTime();
    if (!Number.isFinite(lastEdited) || lastEdited <= 0) return;
    const days = Math.floor((now - lastEdited) / (1000 * 60 * 60 * 24));
    const overOpen = kind === "ouvert" && days > STAGE_SLA_OPEN_DAYS;
    const overApplied = kind === "candidature" && days > STAGE_SLA_APPLIED_DAYS;
    if (!overOpen && !overApplied) return;
    blockers.push({
      id: r.id,
      title: propText(p[jobTitleKey]) || propText(p["Name"]) || "",
      company: propText(p[companyKey]) || "",
      url: propText(p[urlKey]) || "",
      status,
      stagnantDays: days,
      reason: overOpen
        ? `Ouvert > ${STAGE_SLA_OPEN_DAYS} jours`
        : `Candidature > ${STAGE_SLA_APPLIED_DAYS} jours`,
      suggestedNextStatus: overOpen ? "Candidature" : "Entretien",
    });
  });

  blockers.sort((a, b) => b.stagnantDays - a.stagnantDays);
  return { ok: true, items: blockers, total: blockers.length };
}

async function getStageDataQuality() {
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

  const rows = await listDbRowsLimited(token, normalizedDbId, null, 400);
  const jobTitleKey = map.jobTitle || "Job Title";
  const companyKey = map.company || "Entreprise";
  const urlKey = map.url || "lien offre";
  const closeDateKey = map.closeDate || "Date de fermeture";
  const notesKey = map.notes || "Notes";
  const issues = [];

  rows.forEach((r) => {
    const p = r.properties || {};
    const stageTitle = propText(p[jobTitleKey]) || propText(p["Name"]) || "";
    const company = propText(p[companyKey]) || "";
    const url = propText(p[urlKey]) || "";
    const closeDate = propText(p[closeDateKey]) || "";
    const notes = propText(p[notesKey]) || "";

    if (!company) {
      issues.push({
        id: r.id,
        field: "company",
        title: stageTitle,
        currentValue: "",
        suggestedValue: inferCompanyFromUrl(url),
      });
    }
    if (!url) {
      const maybeUrl = String(stageTitle).match(/https?:\/\/\S+/)?.[0] || "";
      issues.push({
        id: r.id,
        field: "url",
        title: stageTitle,
        currentValue: "",
        suggestedValue: maybeUrl,
      });
    }
    if (!closeDate) {
      const suggestedDeadline = suggestDeadlineFromStageData(stageTitle, url, notes);
      issues.push({
        id: r.id,
        field: "deadline",
        title: stageTitle,
        currentValue: "",
        suggestedValue: suggestedDeadline,
      });
    }
  });

  return { ok: true, items: issues, total: issues.length };
}

async function applyStageQualityFix(payload) {
  const { notionToken: token, notionDbId: dbId } = await chrome.storage.sync.get([
    "notionToken",
    "notionDbId",
  ]);
  const { notionFieldMap } = await chrome.storage.sync.get(["notionFieldMap"]);
  const map = notionFieldMap || {};

  if (!token || !dbId) throw new Error("Config Notion manquante (Options).");
  const pageId = payload?.id;
  if (!pageId) throw new Error("Stage ID manquant.");
  const normalizedDbId = normalizeDbId(dbId);
  if (!normalizedDbId) {
    throw new Error("Invalid database ID. Please paste the database URL or ID in Options.");
  }

  const db = await notionFetch(token, `databases/${normalizedDbId}`, "GET");
  const companyKey = map.company || "Entreprise";
  const urlKey = map.url || "lien offre";
  const closeDateKey = map.closeDate || "Date de fermeture";
  const properties = {};
  const value = normalizeText(payload?.value || "");
  const field = normalizeText(payload?.field || "").toLowerCase();
  if (!field) throw new Error("Champ manquant.");

  if (field === "company" && value) {
    const prop = db.properties?.[companyKey];
    if (prop?.type === "rich_text") {
      properties[companyKey] = { rich_text: [{ text: { content: value } }] };
    } else if (prop?.type === "title") {
      properties[companyKey] = { title: [{ text: { content: value } }] };
    } else if (prop?.type === "select") {
      properties[companyKey] = { select: { name: value } };
    }
  } else if (field === "url" && value) {
    const prop = db.properties?.[urlKey];
    if (prop?.type === "url") {
      properties[urlKey] = { url: value };
    } else {
      properties[urlKey] = { rich_text: [{ text: { content: value } }] };
    }
  } else if (field === "deadline" && value) {
    const prop = db.properties?.[closeDateKey];
    const deadlineIso = extractDateCandidatesFromText(value)[0] || value;
    if (prop?.type === "date") {
      properties[closeDateKey] = { date: { start: deadlineIso } };
    } else {
      properties[closeDateKey] = { rich_text: [{ text: { content: deadlineIso } }] };
    }
  } else {
    return { ok: false, error: "Aucune correction applicable." };
  }

  await notionFetch(token, `pages/${pageId}`, "PATCH", { properties });
  await invalidateStageSnapshot();
  scheduleStageSnapshotRefresh(150);
  return { ok: true };
}

async function getStageById(pageId) {
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
  if (!pageId) throw new Error("Stage ID manquant.");

  const page = await notionFetch(token, `pages/${pageId}`, "GET");
  const p = page.properties || {};
  const jobTitleKey = map.jobTitle || "Job Title";
  const companyKey = map.company || "Entreprise";
  const locationKey = map.location || "Lieu";
  const urlKey = map.url || "lien offre";
  const statusKeyLocal = map.status || "Status";
  const roleKey = map.role || "Role";
  const typeKey = map.type || "Type d'infrastructure";
  const applicationDateKey = map.applicationDate || "Application Date";
  const startMonthKey = map.startMonth || "Start month";
  const openDateKey = map.openDate || "Date d'ouverture";
  const closeDateKey = map.closeDate || "Date de fermeture";
  const notesKey = map.notes || "Notes";

  return {
    ok: true,
    item: {
      id: page.id,
      title: propText(p[jobTitleKey]) || propText(p["Name"]) || "",
      company: propText(p[companyKey]) || "",
      location: propText(p[locationKey]) || "",
      url: propText(p[urlKey]) || "",
      status: propText(p[statusKeyLocal]) || "",
      role: propText(p[roleKey]) || "",
      type: propText(p[typeKey]) || "",
      applicationDate: propText(p[applicationDateKey]) || "",
      startMonth: propText(p[startMonthKey]) || "",
      openDate: propText(p[openDateKey]) || "",
      closeDate: propText(p[closeDateKey]) || "",
      notes: propText(p[notesKey]) || "",
    },
  };
}

async function updateStageNotes(payload) {
  const { notionToken: token } = await chrome.storage.sync.get(["notionToken"]);
  const { notionFieldMap } = await chrome.storage.sync.get(["notionFieldMap"]);
  const map = notionFieldMap || {};

  if (!token) throw new Error("Config Notion manquante (Options).");
  const pageId = payload?.id;
  if (!pageId) throw new Error("Stage ID manquant.");

  const notesKey = map.notes || "Notes";
  const notes = normalizeText(payload?.notes || "");
  const properties = {
    [notesKey]: { rich_text: notes ? [{ text: { content: notes } }] : [] },
  };

  await notionFetch(token, `pages/${pageId}`, "PATCH", { properties });
  await invalidateStageSnapshot();
  scheduleStageSnapshotRefresh(150);
  return { ok: true };
}

async function updateStageStatus(payload) {
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

  if (!token || !dbId) throw new Error("Config Notion manquante (Options).");
  const pageId = payload?.id;
  const statusRaw = normalizeText(payload?.status || "");
  if (!pageId) throw new Error("Stage ID manquant.");
  if (!statusRaw) throw new Error("Status manquant.");

  const normalizedDbId = normalizeDbId(dbId);
  if (!normalizedDbId) {
    throw new Error("Invalid database ID. Please paste the database URL or ID in Options.");
  }

  const db = await notionFetch(token, `databases/${normalizedDbId}`, "GET");
  const statusKey = map.status || "Status";
  const statusProp = db.properties?.[statusKey];
  if (!statusProp) throw new Error("Colonne Status introuvable dans la base.");
  const page = await notionFetch(token, `pages/${pageId}`, "GET");
  const props = page.properties || {};
  const previousRaw = propText(props[statusKey]) || "";

  const value =
    statusRaw.toLowerCase().startsWith("ouv")
      ? statusMap.open || "Ouvert"
      : statusRaw.toLowerCase().includes("refus") || statusRaw.toLowerCase().includes("recal")
        ? statusMap.rejected || "Refus?"
        : statusRaw.toLowerCase().includes("candid")
        ? statusMap.applied || "Candidature envoyee"
        : statusRaw.toLowerCase().includes("entre")
          ? statusMap.interview || "Entretien"
          : statusRaw;

  let propPayload = null;
  if (statusProp.type === "status") {
    propPayload = { [statusKey]: { status: { name: value } } };
  } else if (statusProp.type === "select") {
    propPayload = { [statusKey]: { select: { name: value } } };
  } else if (statusProp.type === "rich_text" || statusProp.type === "title") {
    propPayload = { [statusKey]: { rich_text: [{ text: { content: value } }] } };
  } else {
    throw new Error("Type de colonne Status non supporte.");
  }

  const applicationDateKey = map.applicationDate || "Application Date";

  // Auto-transition side effect: set application date when candidacy is sent.
  if (normalizeStageStatusForAutomation(value) === "candidature") {
    const appDateProp = db.properties?.[applicationDateKey];
    if (appDateProp?.type === "date") {
      propPayload[applicationDateKey] = { date: { start: todayISODate() } };
    } else if (appDateProp?.type === "rich_text" || appDateProp?.type === "title") {
      propPayload[applicationDateKey] = {
        rich_text: [{ text: { content: todayISODate() } }],
      };
    }
  }

  await notionFetch(token, `pages/${pageId}`, "PATCH", { properties: propPayload });

  const nextKind = normalizeStageStatusForAutomation(value);

  await invalidateStageSnapshot();
  scheduleStageSnapshotRefresh(150);
  return { ok: true, previousStatus: previousRaw, newStatus: value, statusKind: nextKind };
}

async function deleteStage(payload) {
  const { notionToken: token } = await chrome.storage.sync.get(["notionToken"]);
  if (!token) throw new Error("Config Notion manquante (Options).");

  const pageId = normalizeText(payload?.id || "");
  if (!pageId) throw new Error("Stage ID manquant.");

  await notionFetch(token, `pages/${pageId}`, "PATCH", { archived: true });
  await invalidateStageSnapshot();
  scheduleStageSnapshotRefresh(150);
  return { ok: true, id: pageId };
}

async function checkTodoDb() {
  const { notionToken: token, notionTodoDbId: dbId } = await chrome.storage.sync.get([
    "notionToken",
    "notionTodoDbId",
  ]);
  if (!token || !dbId) throw new Error("Config Todo Notion manquante (Options).");
  const normalizedDbId = normalizeDbId(dbId);
  if (!normalizedDbId) {
    throw new Error("Invalid Todo database ID. Please paste the database URL or ID in Options.");
  }
  const db = await notionFetch(token, `databases/${normalizedDbId}`, "GET");
  const dbTitle = (db.title || []).map((t) => t?.plain_text || "").join("").trim();
  return { ok: true, dbTitle };
}

function normalizeStatus(value) {
  return normalizeText(value || "").toLowerCase();
}

function isAppliedStatus(norm) {
  return (
    norm === "candidature envoy?e" ||
    norm === "candidature envoyee" ||
    norm === "candidatures envoy?es" ||
    norm === "candidatures envoyees" ||
    norm === "postul?" ||
    norm === "postule" ||
    norm === "candidature envoyee" ||
    norm === "envoy?e" ||
    norm === "envoyee"
  );
}

async function getStageStatusStats() {
  const cached = await chrome.storage.local.get([STAGE_STATS_CACHE_KEY]);
  const cacheEntry = cached[STAGE_STATS_CACHE_KEY];
  if (
    cacheEntry?.at &&
    Date.now() - cacheEntry.at < STAGE_STATS_CACHE_TTL_MS &&
    !cacheEntry?.data?.capped
  ) {
    return { ...cacheEntry.data, cached: true, capped: false };
  }

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
    if (norm === "recal?" || norm === "recale") {
      recaleCount += count;
      return;
    }
    otherBreakdown.push({ status, count });
  });

  otherBreakdown.sort((a, b) => b.count - a.count);

  const total = rows.length;
  const otherCount = Math.max(0, total - openCount - appliedCount - recaleCount);

  const result = {
    ok: true,
    total,
    open: openCount,
    applied: appliedCount,
    recale: recaleCount,
    other: otherCount,
    otherBreakdown,
    capped: false,
  };
  await chrome.storage.local.set({
    [STAGE_STATS_CACHE_KEY]: { at: Date.now(), data: result },
  });
  return result;
}

async function getStageWeeklyKpis() {
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
  const rows = await listDbRows(token, normalizedDbId, null);
  const statusKey = map.status || "Status";
  const applicationDateKey = map.applicationDate || "Application Date";
  const statusProp = db.properties?.[statusKey];
  if (!statusProp) throw new Error("Colonne Status introuvable dans la base.");

  let addedWeek = 0;
  let sentWeek = 0;
  const counts = new Map();

  rows.forEach((r) => {
    const p = r.properties || {};
    if (isDateInCurrentWeek(r.created_time)) {
      addedWeek += 1;
    }
    if (isDateInCurrentWeek(propText(p[applicationDateKey]) || "")) {
      sentWeek += 1;
    }
    const status = propText(p[statusKey]) || "Non renseigne";
    counts.set(status, (counts.get(status) || 0) + 1);
  });

  const total = rows.length || 1;
  const progressByStatus = Array.from(counts.entries())
    .map(([status, count]) => ({
      status,
      count,
      ratio: Math.round((count / total) * 100),
    }))
    .sort((a, b) => b.count - a.count);

  return {
    ok: true,
    weekStart: startOfWeek(new Date()).toISOString().slice(0, 10),
    total: rows.length,
    addedWeek,
    sentWeek,
    progressByStatus,
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

async function getStageConfig() {
  const { notionToken: token, notionDbId: dbId, notionFieldMap, notionStatusMap } =
    await chrome.storage.sync.get([
      "notionToken",
      "notionDbId",
      "notionFieldMap",
      "notionStatusMap",
    ]);

  if (!token || !dbId) throw new Error("Config Notion manquante (Options).");
  const normalizedDbId = normalizeDbId(dbId);
  if (!normalizedDbId) {
    throw new Error("Invalid database ID. Please paste the database URL or ID in Options.");
  }

  return {
    token,
    dbId: normalizedDbId,
    map: notionFieldMap || {},
    statusMap: notionStatusMap || {},
  };
}

async function isStageConfigReady() {
  try {
    const { notionToken: token, notionDbId: dbId } = await chrome.storage.sync.get([
      "notionToken",
      "notionDbId",
    ]);
    return !!token && !!normalizeDbId(dbId);
  } catch (_) {
    return false;
  }
}

async function getStageSchemaCached(config, options = {}) {
  const force = !!options.force;
  const stored = await chrome.storage.local.get([STAGE_SCHEMA_CACHE_KEY]);
  const entry = stored?.[STAGE_SCHEMA_CACHE_KEY];
  const fresh =
    entry?.at &&
    entry?.dbId === config.dbId &&
    Date.now() - entry.at < STAGE_SCHEMA_TTL_MS &&
    entry?.schema;
  if (!force && fresh) {
    return { schema: entry.schema, cached: true };
  }
  const schema = await notionFetch(config.token, `databases/${config.dbId}`, "GET");
  await chrome.storage.local.set({
    [STAGE_SCHEMA_CACHE_KEY]: {
      at: Date.now(),
      dbId: config.dbId,
      schema,
    },
  });
  return { schema, cached: false };
}

async function fetchStageRows(config) {
  return listDbRows(config.token, config.dbId, null);
}

function mapStageRow(row, map) {
  const p = row?.properties || {};
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
  const notesKey = map.notes || "Notes";

  return {
    id: row?.id || "",
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
    notes: propText(p[notesKey]) || "",
    createdTime: row?.created_time || "",
    lastEditedTime: row?.last_edited_time || row?.created_time || "",
  };
}

function buildStageStatsFromItems(items) {
  const counts = new Map();
  items.forEach((item) => {
    const raw = normalizeText(item?.status || "Non renseigne") || "Non renseigne";
    counts.set(raw, (counts.get(raw) || 0) + 1);
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
    if (norm === "recal?" || norm === "recale") {
      recaleCount += count;
      return;
    }
    otherBreakdown.push({ status, count });
  });

  otherBreakdown.sort((a, b) => b.count - a.count);
  const total = items.length;
  const otherCount = Math.max(0, total - openCount - appliedCount - recaleCount);
  return {
    ok: true,
    total,
    open: openCount,
    applied: appliedCount,
    recale: recaleCount,
    other: otherCount,
    otherBreakdown,
    capped: false,
  };
}

function buildStageWeeklyKpisFromItems(items) {
  let addedWeek = 0;
  let sentWeek = 0;
  const counts = new Map();

  items.forEach((item) => {
    if (isDateInCurrentWeek(item.createdTime)) {
      addedWeek += 1;
    }
    if (isDateInCurrentWeek(item.applicationDate || "")) {
      sentWeek += 1;
    }
    const status = item.status || "Non renseigne";
    counts.set(status, (counts.get(status) || 0) + 1);
  });

  const total = items.length || 1;
  const progressByStatus = Array.from(counts.entries())
    .map(([status, count]) => ({
      status,
      count,
      ratio: Math.round((count / total) * 100),
    }))
    .sort((a, b) => b.count - a.count);

  return {
    ok: true,
    weekStart: startOfWeek(new Date()).toISOString().slice(0, 10),
    total: items.length,
    addedWeek,
    sentWeek,
    progressByStatus,
  };
}

function buildStageBlockersFromItems(items) {
  const blockers = [];
  const now = Date.now();
  items.forEach((item) => {
    const status = item.status || "";
    const kind = normalizeStageStatusForAutomation(status);
    const lastEdited = new Date(item.lastEditedTime || item.createdTime || 0).getTime();
    if (!Number.isFinite(lastEdited) || lastEdited <= 0) return;
    const days = Math.floor((now - lastEdited) / (1000 * 60 * 60 * 24));
    const overOpen = kind === "ouvert" && days > STAGE_SLA_OPEN_DAYS;
    const overApplied = kind === "candidature" && days > STAGE_SLA_APPLIED_DAYS;
    if (!overOpen && !overApplied) return;
    blockers.push({
      id: item.id || "",
      title: item.title || "",
      company: item.company || "",
      url: item.url || "",
      status,
      stagnantDays: days,
      reason: overOpen
        ? `Ouvert > ${STAGE_SLA_OPEN_DAYS} jours`
        : `Candidature > ${STAGE_SLA_APPLIED_DAYS} jours`,
      suggestedNextStatus: overOpen ? "Candidature" : "Entretien",
    });
  });
  blockers.sort((a, b) => b.stagnantDays - a.stagnantDays);
  return blockers;
}

function buildStageQualityIssuesFromItems(items) {
  const issues = [];
  items.forEach((item) => {
    const stageTitle = item.title || "";
    const company = item.company || "";
    const url = item.url || "";
    const closeDate = item.closeDate || "";
    const notes = item.notes || "";

    if (!company) {
      issues.push({
        id: item.id || "",
        field: "company",
        title: stageTitle,
        currentValue: "",
        suggestedValue: inferCompanyFromUrl(url),
      });
    }
    if (!url) {
      const maybeUrl = String(stageTitle).match(/https?:\/\/\S+/)?.[0] || "";
      issues.push({
        id: item.id || "",
        field: "url",
        title: stageTitle,
        currentValue: "",
        suggestedValue: maybeUrl,
      });
    }
    if (!closeDate) {
      issues.push({
        id: item.id || "",
        field: "deadline",
        title: stageTitle,
        currentValue: "",
        suggestedValue: suggestDeadlineFromStageData(stageTitle, url, notes),
      });
    }
  });
  return issues;
}

function buildStageDeadlinesFromItems(items) {
  const now = new Date();
  const horizon = new Date();
  horizon.setDate(horizon.getDate() + 14);
  return items
    .filter((item) => {
      const closeDate = normalizeText(item.closeDate || "");
      if (!closeDate) return false;
      const d = parseDateFromAny(closeDate);
      if (!d) return false;
      return d >= now && d <= horizon;
    })
    .map((item) => ({
      id: item.id || "",
      title: item.title || "",
      company: item.company || "",
      url: item.url || "",
      status: item.status || "",
      closeDate: item.closeDate || "",
    }))
    .sort((a, b) => new Date(a.closeDate) - new Date(b.closeDate));
}

function isTodoStageStatus(value) {
  const norm = normalizeText(value || "").toLowerCase();
  return norm === "oa to do" || norm === "hv to do";
}

function buildStageTodoFromItems(items) {
  return items
    .filter((item) => isTodoStageStatus(item.status))
    .map((item) => ({
      id: item.id || "",
      title: item.title || "",
      company: item.company || "",
      url: item.url || "",
      status: item.status || "",
    }));
}

function normalizeStageSnapshot(raw, overrides = {}) {
  const base = raw && typeof raw === "object" ? raw : {};
  const allStages = Array.isArray(base.allStages) ? base.allStages : [];
  const strictOpenStages = allStages.filter((item) => isStrictOpenStageStatus(item?.status));
  const stats = base.stats && typeof base.stats === "object" ? base.stats : buildStageStatsFromItems(allStages);
  const weeklyKpis =
    base.weeklyKpis && typeof base.weeklyKpis === "object"
      ? base.weeklyKpis
      : buildStageWeeklyKpisFromItems(allStages);
  const normalized = {
    version: Number.isFinite(base.version) ? base.version : 1,
    generatedAt: Number.isFinite(base.generatedAt) ? base.generatedAt : Date.now(),
    source: base.source || "cache",
    stale: !!base.stale,
    total: Number.isFinite(base.total) ? base.total : allStages.length,
    allStages,
    openStages: strictOpenStages,
    todoStages: Array.isArray(base.todoStages) ? base.todoStages : buildStageTodoFromItems(allStages),
    stats,
    weeklyKpis,
    blockers: Array.isArray(base.blockers) ? base.blockers : buildStageBlockersFromItems(allStages),
    quality: Array.isArray(base.quality) ? base.quality : buildStageQualityIssuesFromItems(allStages),
    deadlines: Array.isArray(base.deadlines) ? base.deadlines : buildStageDeadlinesFromItems(allStages),
    instrumentation: base.instrumentation || null,
    capped: false,
  };
  return { ...normalized, ...overrides };
}

function buildStageDashboardSnapshot(rows, map, meta = {}) {
  const allStages = rows.map((row) => mapStageRow(row, map));
  const openStages = allStages.filter((item) => isStrictOpenStageStatus(item.status));
  const stats = buildStageStatsFromItems(allStages);
  const weeklyKpis = buildStageWeeklyKpisFromItems(allStages);
  const blockers = buildStageBlockersFromItems(allStages);
  const quality = buildStageQualityIssuesFromItems(allStages);
  const deadlines = buildStageDeadlinesFromItems(allStages);
  const todoStages = buildStageTodoFromItems(allStages);
  return normalizeStageSnapshot(
    {
      version: 1,
      generatedAt: Date.now(),
      source: "network",
      stale: false,
      total: allStages.length,
      allStages,
      openStages,
      todoStages,
      stats,
      weeklyKpis,
      blockers,
      quality,
      deadlines,
      instrumentation: {
        stageRowsCount: allStages.length,
        stageSnapshotFetchMs: meta.fetchMs || 0,
        stageSnapshotBuildMs: meta.buildMs || 0,
        source: "network",
        schemaFromCache: !!meta.schemaFromCache,
      },
    },
    { source: "network", stale: false }
  );
}

async function readStageSnapshot() {
  const stored = await chrome.storage.local.get([STAGE_DASHBOARD_SNAPSHOT_KEY]);
  const raw = stored?.[STAGE_DASHBOARD_SNAPSHOT_KEY];
  if (!raw || typeof raw !== "object") return null;
  return normalizeStageSnapshot(raw);
}

async function writeStageSnapshot(snapshot) {
  const normalized = normalizeStageSnapshot(snapshot, { source: "network", stale: false });
  await chrome.storage.local.set({
    [STAGE_DASHBOARD_SNAPSHOT_KEY]: normalized,
    [STAGE_STATS_CACHE_KEY]: { at: normalized.generatedAt, data: normalized.stats },
  });
  return normalized;
}

function isStageSnapshotFresh(snapshot) {
  if (!snapshot?.generatedAt) return false;
  return Date.now() - snapshot.generatedAt < STAGE_DASHBOARD_TTL_MS;
}

async function refreshStageSnapshot(options = {}) {
  const force = !!options.force;
  const allowStaleOnError = options.allowStaleOnError !== false;
  if (stageSnapshotInFlight && !force) {
    return stageSnapshotInFlight;
  }
  stageSnapshotInFlight = (async () => {
    const config = await getStageConfig();
    const fetchStart = Date.now();
    const schemaInfo = await getStageSchemaCached(config, { force: false });
    const rows = await fetchStageRows(config);
    const fetchMs = Date.now() - fetchStart;
    const buildStart = Date.now();
    const snapshot = buildStageDashboardSnapshot(rows, config.map, {
      fetchMs,
      buildMs: 0,
      schemaFromCache: schemaInfo.cached,
    });
    snapshot.instrumentation.stageSnapshotBuildMs = Date.now() - buildStart;
    await writeStageSnapshot(snapshot);
    await recordDiagnosticSync("stageSnapshot", "ok", {
      stageRowsCount: rows.length,
      stageSnapshotFetchMs: snapshot.instrumentation.stageSnapshotFetchMs,
      stageSnapshotBuildMs: snapshot.instrumentation.stageSnapshotBuildMs,
      source: "network",
    });
    return snapshot;
  })()
    .catch(async (err) => {
      if (allowStaleOnError) {
        const fallback = await readStageSnapshot();
        if (fallback) {
          return normalizeStageSnapshot(fallback, {
            source: "cache",
            stale: true,
          });
        }
      }
      throw err;
    })
    .finally(() => {
      stageSnapshotInFlight = null;
    });
  return stageSnapshotInFlight;
}

async function getStageSnapshot(options = {}) {
  const force = !!options.force;
  const allowStale = options.allowStale !== false;
  if (force) {
    return refreshStageSnapshot({ force: true, allowStaleOnError: allowStale });
  }
  const cached = await readStageSnapshot();
  if (cached && isStageSnapshotFresh(cached)) {
    return normalizeStageSnapshot(cached, {
      source: "cache",
      stale: false,
    });
  }
  if (cached && allowStale) {
    refreshStageSnapshot({ allowStaleOnError: true }).catch(() => {});
    return normalizeStageSnapshot(cached, {
      source: "cache",
      stale: true,
    });
  }
  return refreshStageSnapshot({ allowStaleOnError: allowStale });
}

async function invalidateStageSnapshot() {
  await chrome.storage.local.remove([STAGE_DASHBOARD_SNAPSHOT_KEY, STAGE_STATS_CACHE_KEY]);
}

function scheduleStageSnapshotRefresh(delayMs = 1000) {
  const delay = Math.max(0, Number(delayMs) || 0);
  if (stageSnapshotRefreshTimer) {
    clearTimeout(stageSnapshotRefreshTimer);
  }
  stageSnapshotRefreshTimer = setTimeout(() => {
    stageSnapshotRefreshTimer = null;
    refreshStageSnapshot({ allowStaleOnError: true }).catch(() => {});
  }, delay);
}

async function getStageDashboard(payload) {
  const snapshot = await getStageSnapshot({
    force: !!payload?.force,
    allowStale: payload?.allowStale !== false,
  });
  return { ok: true, snapshot };
}

async function refreshStageDashboard() {
  const snapshot = await refreshStageSnapshot({
    force: true,
    allowStaleOnError: true,
  });
  return { ok: true, snapshot };
}

async function listOpenStagesFast() {
  const snapshot = await getStageSnapshot({ allowStale: true });
  const items = Array.isArray(snapshot.openStages) ? snapshot.openStages : [];
  return {
    ok: true,
    items,
    total: items.length,
    capped: false,
    cached: snapshot.source === "cache",
    stale: !!snapshot.stale,
  };
}

async function listTodoStagesFast() {
  const snapshot = await getStageSnapshot({ allowStale: true });
  const items = Array.isArray(snapshot.todoStages)
    ? snapshot.todoStages
    : buildStageTodoFromItems(snapshot.allStages || []);
  return {
    ok: true,
    items,
    total: items.length,
    capped: false,
    cached: snapshot.source === "cache",
    stale: !!snapshot.stale,
  };
}

async function listAllStagesFast() {
  const snapshot = await getStageSnapshot({ allowStale: true });
  const items = Array.isArray(snapshot.allStages) ? snapshot.allStages : [];
  return {
    ok: true,
    items,
    total: items.length,
    capped: false,
    cached: snapshot.source === "cache",
    stale: !!snapshot.stale,
  };
}

async function getStageStatusStatsFast() {
  const snapshot = await getStageSnapshot({ allowStale: true });
  const stats = snapshot.stats || buildStageStatsFromItems(snapshot.allStages || []);
  return {
    ...stats,
    cached: snapshot.source === "cache",
    stale: !!snapshot.stale,
  };
}

async function getStageWeeklyKpisFast() {
  const snapshot = await getStageSnapshot({ allowStale: true });
  const weekly = snapshot.weeklyKpis || buildStageWeeklyKpisFromItems(snapshot.allStages || []);
  return {
    ...weekly,
    cached: snapshot.source === "cache",
    stale: !!snapshot.stale,
  };
}

async function getStageBlockersFast() {
  const snapshot = await getStageSnapshot({ allowStale: true });
  const items = Array.isArray(snapshot.blockers)
    ? snapshot.blockers
    : buildStageBlockersFromItems(snapshot.allStages || []);
  return {
    ok: true,
    items,
    total: items.length,
    cached: snapshot.source === "cache",
    stale: !!snapshot.stale,
  };
}

async function getStageDataQualityFast() {
  const snapshot = await getStageSnapshot({ allowStale: true });
  const items = Array.isArray(snapshot.quality)
    ? snapshot.quality
    : buildStageQualityIssuesFromItems(snapshot.allStages || []);
  return {
    ok: true,
    items,
    total: items.length,
    cached: snapshot.source === "cache",
    stale: !!snapshot.stale,
  };
}

async function listStageDeadlinesFast() {
  const snapshot = await getStageSnapshot({ allowStale: true });
  const items = Array.isArray(snapshot.deadlines)
    ? snapshot.deadlines
    : buildStageDeadlinesFromItems(snapshot.allStages || []);
  return {
    ok: true,
    items,
    cached: snapshot.source === "cache",
    stale: !!snapshot.stale,
  };
}

function findDbPropKeyByName(props, names) {
  const list = (names || []).map((n) => String(n || "").toLowerCase());
  return Object.keys(props || {}).find((key) => list.includes(key.toLowerCase())) || "";
}

function findDbPropKeyByType(props, types) {
  return Object.keys(props || {}).find((key) => (types || []).includes(props[key]?.type)) || "";
}

function resolveTodoDbKeys(props) {
  return {
    statusKey: findDbPropKeyByName(props, ["Status"]) || findDbPropKeyByType(props, ["status", "select"]),
    taskKey: findDbPropKeyByName(props, ["Task", "Name"]) || findDbPropKeyByType(props, ["title"]),
    dueKey:
      findDbPropKeyByName(props, ["Due date", "Due Date", "Deadline", "Date"]) ||
      findDbPropKeyByType(props, ["date"]),
    notesKey:
      findDbPropKeyByName(props, ["Notes", "Note"]) || findDbPropKeyByType(props, ["rich_text"]),
  };
}

function statusPropOptions(statusProp) {
  if (!statusProp || typeof statusProp !== "object") return [];
  if (statusProp.type === "status") return statusProp.status?.options || [];
  if (statusProp.type === "select") return statusProp.select?.options || [];
  return [];
}

function resolveTodoStatusName(statusProp, preferred, fallbacks = []) {
  const options = statusPropOptions(statusProp);
  const preferredText = normalizeText(preferred || "");
  if (!options.length) return preferredText || "Not Started";

  const byNorm = new Map();
  options.forEach((opt) => {
    const name = normalizeText(opt?.name || "");
    if (!name) return;
    byNorm.set(name.toLowerCase(), name);
  });

  const candidates = [preferredText, ...(fallbacks || [])]
    .map((v) => normalizeText(v).toLowerCase())
    .filter(Boolean);

  for (const c of candidates) {
    if (byNorm.has(c)) return byNorm.get(c);
  }

  return normalizeText(options[0]?.name || preferredText || "Not Started") || "Not Started";
}

function resolveTodoDoneName(statusProp, fallback = "Done") {
  return resolveTodoStatusName(statusProp, fallback, [
    "Done",
    "Termine",
    "Terminee",
    "Terminé",
    "Terminée",
    "Complete",
    "Completed",
    "Fait",
  ]);
}

function buildTodoStatusProperty(statusProp, statusValue) {
  const value = normalizeText(statusValue || "");
  if (!value) throw new Error("Status todo vide.");
  if (statusProp?.type === "status") {
    return { status: { name: value } };
  }
  if (statusProp?.type === "select") {
    return { select: { name: value } };
  }
  if (statusProp?.type === "rich_text" || statusProp?.type === "title") {
    return { rich_text: [{ text: { content: value } }] };
  }
  throw new Error("Type de colonne Status non supporte dans la base Todo.");
}

async function listNotionTodos() {
  const { notionToken: token, notionTodoDbId: dbId } = await chrome.storage.sync.get([
    "notionToken",
    "notionTodoDbId",
  ]);
  if (!token || !dbId) throw new Error("Config Todo Notion manquante (Options).");

  const normalizedDbId = normalizeDbId(dbId);
  if (!normalizedDbId) {
    throw new Error("Invalid Todo database ID. Please paste the database URL or ID in Options.");
  }

  const db = await notionFetch(token, `databases/${normalizedDbId}`, "GET");
  const props = db.properties || {};
  const { statusKey, taskKey, dueKey, notesKey } = resolveTodoDbKeys(props);

  const statusProp = props?.[statusKey];
  if (!statusProp) throw new Error("Colonne Status introuvable dans la base Todo.");
  const doneLabel = resolveTodoDoneName(statusProp, "Done");

  let filter = null;
  if (statusProp.type === "status") {
    filter = { property: statusKey, status: { does_not_equal: doneLabel } };
  } else if (statusProp.type === "select") {
    filter = { property: statusKey, select: { does_not_equal: doneLabel } };
  } else {
    throw new Error("Type de colonne Status non supporte.");
  }

  const rows = await listDbRows(token, normalizedDbId, filter);
  const mapped = rows.map((r) => {
    const p = r.properties || {};
    return {
      id: r.id,
      task: propText(p[taskKey]) || propText(p["Name"]) || "",
      status: propText(p[statusKey]) || "",
      dueDate: propText(p[dueKey]) || "",
      notes: propText(p[notesKey]) || "",
    };
  });

  return { ok: true, items: mapped };
}

async function createNotionTodo(payload) {
  const { notionToken: token, notionTodoDbId: dbId } = await chrome.storage.sync.get([
    "notionToken",
    "notionTodoDbId",
  ]);
  if (!token || !dbId) throw new Error("Config Todo Notion manquante (Options).");
  const normalizedDbId = normalizeDbId(dbId);
  if (!normalizedDbId) {
    throw new Error("Invalid Todo database ID. Please paste the database URL or ID in Options.");
  }

  const task = normalizeText(payload?.task || "");
  if (!task) throw new Error("Task obligatoire.");
  const status = normalizeText(payload?.status || "Not Started");
  const dueDate = normalizeText(payload?.dueDate || "");
  const notes = normalizeText(payload?.notes || "");

  const db = await notionFetch(token, `databases/${normalizedDbId}`, "GET");
  const props = db.properties || {};
  const { statusKey, taskKey, dueKey, notesKey } = resolveTodoDbKeys(props);
  const statusProp = props?.[statusKey];
  const taskProp = props?.[taskKey];
  const dueProp = props?.[dueKey];
  const notesProp = props?.[notesKey];

  const properties = {};
  if (taskProp?.type === "title") {
    properties[taskKey] = { title: [{ text: { content: task } }] };
  } else if (taskProp?.type === "rich_text") {
    properties[taskKey] = { rich_text: [{ text: { content: task } }] };
  } else if (taskKey) {
    properties[taskKey] = { title: [{ text: { content: task } }] };
  } else {
    properties.Task = { title: [{ text: { content: task } }] };
  }

  if (!statusProp || !statusKey) {
    throw new Error("Colonne Status introuvable dans la base Todo.");
  }
  const statusName = resolveTodoStatusName(statusProp, status, [
    "Not Started",
    "Not started",
    "To do",
    "Todo",
    "A faire",
  ]);
  properties[statusKey] = buildTodoStatusProperty(statusProp, statusName);

  if (dueDate) {
    if (dueProp?.type === "date" && dueKey) {
      properties[dueKey] = { date: { start: dueDate } };
    } else if (dueKey) {
      properties[dueKey] = { rich_text: [{ text: { content: dueDate } }] };
    } else {
      properties["Due date"] = { date: { start: dueDate } };
    }
  }
  if (notes) {
    if (notesProp?.type === "rich_text" && notesKey) {
      properties[notesKey] = { rich_text: [{ text: { content: notes } }] };
    } else if (notesProp?.type === "title" && notesKey) {
      properties[notesKey] = { title: [{ text: { content: notes } }] };
    } else if (notesKey) {
      properties[notesKey] = { rich_text: [{ text: { content: notes } }] };
    } else {
      properties.Notes = { rich_text: [{ text: { content: notes } }] };
    }
  }

  await notionFetch(token, `pages`, "POST", {
    parent: { database_id: normalizedDbId },
    properties,
  });
  return { ok: true };
}

async function updateNotionTodoStatus(payload) {
  const { notionToken: token, notionTodoDbId: dbId } = await chrome.storage.sync.get([
    "notionToken",
    "notionTodoDbId",
  ]);
  if (!token || !dbId) throw new Error("Config Todo Notion manquante (Options).");
  const pageId = payload?.id;
  if (!pageId) throw new Error("Todo ID manquant.");

  const normalizedDbId = normalizeDbId(dbId);
  if (!normalizedDbId) {
    throw new Error("Invalid Todo database ID. Please paste the database URL or ID in Options.");
  }

  const db = await notionFetch(token, `databases/${normalizedDbId}`, "GET");
  const props = db.properties || {};
  const { statusKey } = resolveTodoDbKeys(props);
  const statusProp = props?.[statusKey];
  if (!statusProp || !statusKey) {
    throw new Error("Colonne Status introuvable dans la base Todo.");
  }

  const requestedStatus = normalizeText(payload?.status || "");
  const statusName = requestedStatus
    ? resolveTodoStatusName(statusProp, requestedStatus)
    : resolveTodoDoneName(statusProp, "Done");
  const properties = {
    [statusKey]: buildTodoStatusProperty(statusProp, statusName),
  };

  await notionFetch(token, `pages/${pageId}`, "PATCH", { properties });
  return { ok: true };
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
    notion: { ok: false, message: "Non configure." },
    google: { ok: false, message: "Non connecte." },
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
      results.google = { ok: false, message: "Non connecte." };
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
    return respondWith(checkDbAndLoad(), sendResponse, "Notion - verification base", {
      syncName: "notionCheck",
      successDetails: (r) => ({
        rows: r?.total ?? (Array.isArray(r?.rows) ? r.rows.length : null),
        columns: Array.isArray(r?.columns) ? r.columns.length : null,
      }),
    });
  }

  if (msg?.type === "CHECK_TODO_DB") {
    return respondWith(checkTodoDb(), sendResponse, "Notion - verification todo", {
      syncName: "notionTodoCheck",
    });
  }

  if (msg?.type === "GET_STAGE_DASHBOARD") {
    return respondWith(
      getStageDashboard(msg?.payload),
      sendResponse,
      "Notion - dashboard stages",
      {
        syncName: "notionStageDashboard",
        successDetails: (r) => ({
          total: r?.snapshot?.total ?? null,
          stale: !!r?.snapshot?.stale,
          source: r?.snapshot?.source || null,
        }),
      }
    );
  }

  if (msg?.type === "REFRESH_STAGE_DASHBOARD") {
    return respondWith(
      refreshStageDashboard(),
      sendResponse,
      "Notion - refresh dashboard stages",
      {
        syncName: "notionStageDashboard",
        successDetails: (r) => ({
          total: r?.snapshot?.total ?? null,
          stale: !!r?.snapshot?.stale,
          source: r?.snapshot?.source || null,
        }),
      }
    );
  }

  if (msg?.type === "GET_OPEN_STAGES") {
    return respondWith(listOpenStagesFast(), sendResponse, "Notion - stages ouverts", {
      syncName: "notionOpenStages",
      successDetails: (r) => ({
        total: r?.total ?? null,
        capped: !!r?.capped,
      }),
    });
  }

  if (msg?.type === "GET_ALL_STAGES") {
    return respondWith(listAllStagesFast(), sendResponse, "Notion - tous les stages", {
      syncName: "notionAllStages",
    });
  }

  if (msg?.type === "GET_STAGE_BY_ID") {
    return respondWith(getStageById(msg?.payload?.id), sendResponse, "Notion - stage detail", {
      syncName: "notionStageDetail",
      meta: { id: msg?.payload?.id || null },
    });
  }

  if (msg?.type === "UPDATE_STAGE_NOTES") {
    return respondWith(
      updateStageNotes(msg?.payload),
      sendResponse,
      "Notion - stage notes",
      {
        syncName: "notionStageNotes",
        meta: { id: msg?.payload?.id || null },
      }
    );
  }

  if (msg?.type === "UPDATE_STAGE_STATUS") {
    return respondWith(
      updateStageStatus(msg?.payload),
      sendResponse,
      "Notion - stage status",
      {
        syncName: "notionStageStatus",
        meta: { id: msg?.payload?.id || null },
      }
    );
  }

  if (msg?.type === "DELETE_STAGE") {
    return respondWith(
      deleteStage(msg?.payload),
      sendResponse,
      "Notion - suppression stage",
      {
        syncName: "notionStageDelete",
        meta: { id: msg?.payload?.id || null },
      }
    );
  }

  if (msg?.type === "SCHEDULE_INTERVIEW_REMINDER") {
    const { id, when, title, link } = msg?.payload || {};
    if (!id || !when) {
      sendResponse({ ok: false, error: "Parametres manquants." });
      return true;
    }
    const whenMs = new Date(when).getTime();
    if (!Number.isFinite(whenMs)) {
      sendResponse({ ok: false, error: "Date invalide." });
      return true;
    }
    const alarmName = `${INTERVIEW_ALARM_PREFIX}${id}`;
    chrome.alarms.create(alarmName, { when: whenMs });
    chrome.storage.local.set({
      [alarmName]: {
        title: title || "Entretien",
        link: link || "",
        when,
      },
    });
    sendResponse({ ok: true });
    return true;
  }

  if (msg?.type === "CLEAR_INTERVIEW_REMINDER") {
    const { id } = msg?.payload || {};
    if (!id) {
      sendResponse({ ok: false, error: "Parametres manquants." });
      return true;
    }
    const alarmName = `${INTERVIEW_ALARM_PREFIX}${id}`;
    chrome.alarms.clear(alarmName, () => {
      chrome.storage.local.remove([alarmName], () => {
        sendResponse({ ok: true });
      });
    });
    return true;
  }

  if (msg?.type === "GET_TODO_STAGES") {
    return respondWith(listTodoStagesFast(), sendResponse, "Notion - stages a faire", {
      syncName: "notionTodoStages",
      successDetails: (r) => ({
        total: r?.total ?? null,
        capped: !!r?.capped,
      }),
    });
  }

  if (msg?.type === "GET_STAGE_STATUS_STATS") {
    return respondWith(getStageStatusStatsFast(), sendResponse, "Notion - stats stages", {
      syncName: "notionStageStats",
      successDetails: (r) => ({
        total: r?.total ?? null,
        capped: !!r?.capped,
      }),
    });
  }

  if (msg?.type === "GET_STAGE_WEEKLY_KPIS") {
    return respondWith(getStageWeeklyKpisFast(), sendResponse, "Notion - KPI hebdo stages", {
      syncName: "notionStageKpis",
    });
  }

  if (msg?.type === "GET_STAGE_DEADLINES") {
    return respondWith(listStageDeadlinesFast(), sendResponse, "Notion - deadlines stages", {
      syncName: "notionStageDeadlines",
    });
  }

  if (msg?.type === "GET_STAGE_BLOCKERS") {
    return respondWith(getStageBlockersFast(), sendResponse, "Notion - SLA blocages stages", {
      syncName: "notionStageBlockers",
    });
  }

  if (msg?.type === "GET_STAGE_DATA_QUALITY") {
    return respondWith(getStageDataQualityFast(), sendResponse, "Notion - qualite donnees stages", {
      syncName: "notionStageQuality",
    });
  }

  if (msg?.type === "APPLY_STAGE_QUALITY_FIX") {
    return respondWith(
      applyStageQualityFix(msg?.payload),
      sendResponse,
      "Notion - appliquer correction qualite",
      { syncName: "notionStageQualityFix" }
    );
  }

  if (msg?.type === "LIST_TODO_NOTION") {
    return respondWith(listNotionTodos(), sendResponse, "Notion - todo list", {
      syncName: "notionTodoList",
    });
  }

  if (msg?.type === "CREATE_TODO_NOTION") {
    return respondWith(createNotionTodo(msg.payload), sendResponse, "Notion - todo create", {
      syncName: "notionTodoCreate",
    });
  }

  if (msg?.type === "UPDATE_TODO_NOTION") {
    return respondWith(updateNotionTodoStatus(msg.payload), sendResponse, "Notion - todo update", {
      syncName: "notionTodoUpdate",
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
      "Google Calendar - chargement evenements",
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
      connectGoogleInteractive(),
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
      const entry = await handleError(err, "Google Calendar - d?connexion", null, {
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
      "Google Calendar - creation evenement",
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
      "Google Calendar - mise ? jour ?v?nement",
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
      "Google Calendar - suppression ?v?nement",
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
      "Google Calendar - creation + invitations",
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
    return respondWith(syncNotionToCalendar(), sendResponse, "Sync Notion -> Calendar", {
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

  if (msg?.type === "GCAL_GET_REMINDER_PREFS") {
    chrome.storage.local.get([GCAL_REMINDER_PREFS_KEY], (data) => {
      const prefs = normalizeReminderPrefs(data?.[GCAL_REMINDER_PREFS_KEY]);
      sendResponse({ ok: true, prefs });
    });
    return true;
  }

  if (msg?.type === "GCAL_SET_REMINDER_PREFS") {
    const prefs = normalizeReminderPrefs(msg?.payload?.prefs);
    chrome.storage.local.set({ [GCAL_REMINDER_PREFS_KEY]: prefs }, () => {
      sendResponse({ ok: true, prefs });
    });
    return true;
  }

  if (msg?.type === "GCAL_SNOOZE_CUSTOM") {
    return respondWith(
      scheduleCustomGcalSnooze(msg?.payload),
      sendResponse,
      "Google Calendar - snooze manuel",
      { syncName: "gcalSnooze" }
    );
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
      "Yahoo News - rafraichissement",
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

function createGcalNotification(notificationId, data) {
  const startText = data?.start ? new Date(data.start).toLocaleString() : "";
  const typeLabel =
    data?.eventType === "deadline"
      ? "Deadline"
      : data?.eventType === "entretien"
        ? "Entretien"
        : data?.eventType === "meeting"
          ? "Reunion"
          : "Evenement";
  const title = `${typeLabel}: ${data?.summary || "Evenement"}`;
  const mins = Number.parseInt(data?.minutesBefore || "0", 10);
  const prefix = Number.isFinite(mins) && mins > 0 ? `${mins} min - ` : "";
  const message = startText ? `${prefix}${startText}` : "Evenement a venir";

  chrome.notifications.create(notificationId, {
    type: "basic",
    iconUrl: "icons/icon-128.png",
    title,
    message,
    priority: 2,
    buttons: [{ title: "Snooze 15 min" }, { title: "Snooze 1h" }],
  });
}

async function notifySlaBlockers() {
  const res = await getStageBlockersFast();
  if (!res?.ok) return;
  const items = Array.isArray(res.items) ? res.items : [];
  if (!items.length) return;
  const top = items.slice(0, 3);
  const title = `${items.length} blocage(s) de process`;
  const message = top
    .map((i) => `${i.company || "Entreprise"} - ${i.title || "Stage"} (${i.stagnantDays}j)`)
    .join(" | ")
    .slice(0, 250);
  chrome.notifications.create(`sla|${Date.now()}`, {
    type: "basic",
    iconUrl: "icons/icon-128.png",
    title,
    message,
    priority: 2,
  });
}

async function scheduleGcalSnooze(notificationId, minutes) {
  const when = Date.now() + minutes * 60 * 1000;
  const alarmName = `${GCAL_SNOOZE_ALARM_PREFIX}${notificationId}|${minutes}|${Date.now()}`;
  const { gcalEventMap } = await chrome.storage.local.get(["gcalEventMap"]);
  const source = gcalEventMap?.[notificationId];
  if (!source) return;
  await chrome.storage.local.set({
    [alarmName]: {
      ...source,
      snoozeMinutes: minutes,
      sourceNotificationId: notificationId,
    },
  });
  chrome.alarms.create(alarmName, { when });
}

async function scheduleCustomGcalSnooze(payload) {
  const minutes = Number.parseInt(payload?.minutes, 10);
  if (!Number.isFinite(minutes) || minutes <= 0) {
    throw new Error("Minutes de snooze invalides.");
  }
  const when = Date.now() + minutes * 60 * 1000;
  const sourceId = `manual|${Date.now()}|${Math.random().toString(16).slice(2)}`;
  const alarmName = `${GCAL_SNOOZE_ALARM_PREFIX}${sourceId}|${minutes}`;
  const data = {
    summary: payload?.summary || "Evenement",
    start: payload?.start || "",
    minutesBefore: 0,
    link: payload?.link || "",
    eventType: payload?.eventType || "default",
  };
  await chrome.storage.local.set({ [alarmName]: data });
  chrome.alarms.create(alarmName, { when });
  return { ok: true };
}

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (!alarm?.name) return;
  if (alarm.name === STAGE_SLA_ALARM) {
    notifySlaBlockers().catch(() => {});
    return;
  }
  if (alarm.name === STAGE_DATA_SYNC_ALARM) {
    const ready = await isStageConfigReady();
    if (!ready) return;
    try {
      await refreshStageSnapshot({ allowStaleOnError: true });
    } catch (err) {
      await handleError(err, "Alarme Sync Stage Snapshot", null, {
        syncName: "stageSnapshot",
      });
    }
    return;
  }
  if (alarm.name.startsWith(GCAL_SNOOZE_ALARM_PREFIX)) {
    chrome.storage.local.get([alarm.name], (data) => {
      const info = data[alarm.name];
      if (!info) return;
      createGcalNotification(alarm.name, info);
    });
    return;
  }

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

  if (alarm.name.startsWith(INTERVIEW_ALARM_PREFIX)) {
    chrome.storage.local.get([alarm.name], (data) => {
      const info = data[alarm.name];
      if (!info) return;
      const message = info.when
        ? `Rappel entretien: ${new Date(info.when).toLocaleString()}`
        : "Rappel entretien";
      chrome.notifications.create(alarm.name, {
        type: "basic",
        iconUrl: "icons/icon-128.png",
        title: info.title || "Entretien",
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
      await handleError(err, "Alarme Sync Notion -> Calendar", null, {
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

  createGcalNotification(alarm.name, data);

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
  seedDefaultConfig().catch(() => {});
  chrome.alarms.create(GCAL_SYNC_ALARM, { periodInMinutes: 15 });
  chrome.alarms.create(YAHOO_NEWS_ALARM, { periodInMinutes: 15 });
  chrome.alarms.create(NOTION_SYNC_ALARM, { periodInMinutes: 60 });
  chrome.alarms.create(STAGE_DATA_SYNC_ALARM, { periodInMinutes: 2 });
  chrome.alarms.create(STAGE_SLA_ALARM, { periodInMinutes: 720 });
  flushOfflineQueue();
  scheduleStageSnapshotRefresh(3000);
  ensureUrlBlockerDefaults().then(() => applyUrlBlockerRules()).then(checkAllTabsForBlocker);
});

chrome.notifications.onClicked.addListener((notificationId) => {
  if (!notificationId) return;
  if (notificationId.startsWith(INTERVIEW_ALARM_PREFIX)) {
    chrome.storage.local.get([notificationId], (data) => {
      const info = data[notificationId];
      const link = info?.link || "";
      if (link && chrome?.tabs?.create) {
        chrome.tabs.create({ url: link });
      }
    });
    return;
  }
  if (notificationId.startsWith(GCAL_ALARM_PREFIX) || notificationId.startsWith(GCAL_SNOOZE_ALARM_PREFIX)) {
    chrome.storage.local.get(["gcalEventMap", notificationId], (data) => {
      const info = data[notificationId] || data?.gcalEventMap?.[notificationId];
      const link = info?.link || "";
      if (link && chrome?.tabs?.create) {
        chrome.tabs.create({ url: link });
      } else if (chrome?.tabs?.create) {
        chrome.tabs.create({ url: "calendar.html" });
      }
    });
    return;
  }
  if (notificationId.startsWith(DEADLINE_ALARM_PREFIX)) {
    chrome.storage.local.get([notificationId], (data) => {
      const info = data[notificationId];
      const link = info?.url || "";
      if (link && chrome?.tabs?.create) {
        chrome.tabs.create({ url: link });
      }
    });
  }
});

chrome.notifications.onButtonClicked.addListener((notificationId, buttonIndex) => {
  if (!notificationId) {
    return;
  }
  const minutes = buttonIndex === 0 ? 15 : 60;
  if (notificationId.startsWith(GCAL_ALARM_PREFIX)) {
    scheduleGcalSnooze(notificationId, minutes).catch(() => {});
    chrome.notifications.clear(notificationId);
    return;
  }
  if (notificationId.startsWith(GCAL_SNOOZE_ALARM_PREFIX)) {
    chrome.storage.local.get([notificationId], (data) => {
      const info = data?.[notificationId];
      if (!info) return;
      scheduleCustomGcalSnooze({
        summary: info.summary || "Evenement",
        start: info.start || "",
        link: info.link || "",
        eventType: info.eventType || "default",
        minutes,
      }).catch(() => {});
    });
  }
  chrome.notifications.clear(notificationId);
});

chrome.runtime.onStartup.addListener(() => {
  seedDefaultConfig().catch(() => {});
  chrome.alarms.create(GCAL_SYNC_ALARM, { periodInMinutes: 15 });
  chrome.alarms.create(YAHOO_NEWS_ALARM, { periodInMinutes: 15 });
  chrome.alarms.create(NOTION_SYNC_ALARM, { periodInMinutes: 60 });
  chrome.alarms.create(STAGE_DATA_SYNC_ALARM, { periodInMinutes: 2 });
  chrome.alarms.create(STAGE_SLA_ALARM, { periodInMinutes: 720 });
  flushOfflineQueue();
  scheduleStageSnapshotRefresh(3000);
  ensureUrlBlockerDefaults().then(() => applyUrlBlockerRules()).then(checkAllTabsForBlocker);
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return;
  if (changes[URL_BLOCKER_RULES_KEY] || changes[URL_BLOCKER_ENABLED_KEY]) {
    applyUrlBlockerRules().then(checkAllTabsForBlocker);
  }
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  const candidateUrl = changeInfo.url || tab?.url || "";
  if (!candidateUrl) return;
  if (changeInfo.url) {
    chrome.storage.local
      .get([URL_BLOCKER_RULES_KEY, URL_BLOCKER_ENABLED_KEY])
      .then((data) => {
        if (data[URL_BLOCKER_ENABLED_KEY] === false) return;
        const filters = normalizeUrlBlockerRules(data[URL_BLOCKER_RULES_KEY] || []);
        if (!filters.length) return;
        if (shouldBlockUrl(candidateUrl, filters)) {
          chrome.tabs.remove(tabId).catch(() => {});
        }
      })
      .catch(() => {});
  }
  // Pipeline auto-import removed.
});
