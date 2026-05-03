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
const GCAL_CACHE_MAX_BUCKETS = 6;
const GCAL_CACHE_FALLBACK_BUCKETS = 2;
const GCAL_CACHE_MAX_EVENTS_PER_BUCKET = 180;
const GCAL_CACHE_FALLBACK_EVENTS_PER_BUCKET = 60;
const GCAL_REMINDER_PREFS_KEY = "gcalReminderPrefs";
const GCAL_SNOOZE_ALARM_PREFIX = "gcal-snooze|";
const GCAL_EVENT_MAP_MAX_ENTRIES = 500;
const GCAL_EVENT_MAP_FALLBACK_ENTRIES = 180;
const GCAL_NOTIFIED_MAX_ENTRIES = 400;
const GCAL_NOTIFIED_RETENTION_MS = 3 * 24 * 60 * 60 * 1000;
const YAHOO_NEWS_ALARM = "yahoo-news-sync";
const YAHOO_NEWS_URL = "https://feeds.finance.yahoo.com/rss/2.0/headline";
const YAHOO_NEWS_CACHE_MIN = 15;
const YAHOO_NEWS_MAX_ITEMS = 25;
const TAG_RULES_KEY = "autoTagRules";
const NOTION_SYNC_ALARM = "notion-calendar-sync";
const NOTION_SYNC_KEY = "notionCalendarSyncEnabled";
const NOTION_SYNC_MAP = "notionCalendarMap";
const NOTION_SYNC_LOOKBACK_DAYS = 45;
const NOTION_SYNC_LOOKAHEAD_DAYS = 400;
const NOTION_SYNC_MAP_MAX_ENTRIES = 2000;
const NOTION_SYNC_MAP_FALLBACK_ENTRIES = 700;
const DEADLINE_PREFS_KEY = "deadlinePrefs";
const DEADLINE_ALARM_PREFIX = "deadline|";
const INTERVIEW_ALARM_PREFIX = "interview|";
const OFFLINE_QUEUE_KEY = "offlineQueue";
const REJECTED_STAGE_QUEUE_KEY = "rejectedStageQueue";
const NOTION_QUEUE_ALARM = "notion-upsert-queue";
const NOTION_QUEUE_RETRY_BASE_MS = 15 * 1000;
const NOTION_QUEUE_RETRY_MAX_MS = 15 * 60 * 1000;
const YAHOO_CHART_URL = "https://query1.finance.yahoo.com/v8/finance/chart";
const YAHOO_QUOTE_CACHE_MIN = 5;
const YAHOO_QUOTES_MAX_SYMBOLS = 32;
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
const STAGE_SNAPSHOT_MAX_CACHED_ROWS = 400;
const STAGE_SNAPSHOT_FALLBACK_ROWS = 120;
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
const URL_BLOCKER_LOGS_KEY = "urlBlockerLogs";
const URL_BLOCKER_BASE_ID = 9000;
const URL_BLOCKER_LOG_LIMIT = 80;
const FOCUS_MODE_ENABLED_KEY = "focusModeEnabled";
const FOCUS_API_BASE = "http://127.0.0.1:49172";
const FOCUS_STATE_KEY = "focusBridgeState";
const FOCUS_POLL_MS = 1500;
const FOCUS_SYNC_ALARM = "focus-sync";
const FOCUS_FETCH_TIMEOUT_MS = 900;
const FOCUS_DNR_BASE_ID = 250000;
const FOCUS_DNR_RANGE = 20000;
const ALARM_STORAGE_RETENTION_MS = 3 * 24 * 60 * 60 * 1000;

let stageSnapshotInFlight = null;
let stageSnapshotRefreshTimer = null;
let notionQueueWorkerInFlight = null;
let urlBlockerLogChain = Promise.resolve();
let focusPollTimer = null;
let focusPollInFlight = null;

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
  if (/resource::kquotabytes|quota[_ ]?bytes|quota exceeded/i.test(msg)) {
    return "STORAGE_QUOTA_EXCEEDED";
  }
  if (
    /failed to fetch|networkerror|fetch failed|net::|network request failed/i.test(
      rawMessage || ""
    )
  ) {
    return "NETWORK_ERROR";
  }
  if (
    /auth_required|auth required|oauth2? request failed|oauth2 not granted|invalid_grant|access_denied|user did not approve|authorization page could not be loaded/i.test(
      msg
    )
  ) {
    return "AUTH_REQUIRED";
  }
  return status ? `HTTP_${status}` : "UNKNOWN_ERROR";
}

function classifyGoogleIdentityError(rawMessage) {
  const msg = String(rawMessage || "").toLowerCase();
  if (!msg) return "AUTH_REQUIRED";
  if (
    /user did not approve|user cancelled|user canceled|access_denied|denied|cancelled|canceled|closed by user/.test(
      msg
    )
  ) {
    return "AUTH_CANCELLED";
  }
  if (/invalid_client|deleted_client|unauthorized_client|client id|oauth client/i.test(msg)) {
    return "GOOGLE_OAUTH_CLIENT_INVALID";
  }
  if (/not a test user|isn't a test user|not in test users|tester/i.test(msg)) {
    return "GOOGLE_OAUTH_TEST_USER_REQUIRED";
  }
  if (/access blocked|app blocked|app is blocked|restricted_client/i.test(msg)) {
    return "GOOGLE_OAUTH_APP_BLOCKED";
  }
  return "AUTH_REQUIRED";
}

function friendlyMessage(code, fallback) {
  switch (code) {
    case "AUTH_CANCELLED":
      return "Connexion Google annulee.";
    case "AUTH_REQUIRED":
      return "Authentification requise. Reconnecte ton compte Google.";
    case "GOOGLE_OAUTH_CLIENT_INVALID":
      return "OAuth Google invalide. Verifie le client_id OAuth configure pour cette extension.";
    case "GOOGLE_OAUTH_TEST_USER_REQUIRED":
      return "Compte Google non autorise. Ajoute ce compte dans les testeurs OAuth de l'app Google.";
    case "GOOGLE_OAUTH_APP_BLOCKED":
      return "L'app OAuth Google est bloquee. Verifie l'ecran de consentement OAuth.";
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
    case "STORAGE_QUOTA_EXCEEDED":
      return "Stockage local de l'extension plein. Le cache est trop volumineux.";
    default:
      return fallback || "Une erreur inconnue est survenue.";
  }
}

function normalizeError(err, context, meta) {
  const rawMessage = String(err?.message || err || "Erreur inconnue");
  const status = Number.isFinite(err?.status) ? err.status : undefined;
  const code = err?.code || classifyError(rawMessage, status);
  const message = friendlyMessage(code, rawMessage);
  const errMeta = err?.meta && typeof err.meta === "object" ? err.meta : null;
  let resolvedMeta = errMeta ? { ...errMeta } : null;
  if (meta !== undefined && meta !== null) {
    if (typeof meta === "object" && !Array.isArray(meta)) {
      resolvedMeta = { ...(resolvedMeta || {}), ...meta };
    } else {
      resolvedMeta = meta;
    }
  }
  return {
    code,
    message,
    rawMessage,
    status: status || null,
    context: context || "operation",
    meta: resolvedMeta,
    at: Date.now(),
  };
}

async function recordDiagnosticError(entry) {
  const { [DIAG_ERRORS_KEY]: stored } = await chrome.storage.local.get([DIAG_ERRORS_KEY]);
  const list = Array.isArray(stored) ? stored : [];
  const next = [entry, ...list].slice(0, DIAG_ERRORS_LIMIT);
  try {
    await setLocalWithQuotaGuard({ [DIAG_ERRORS_KEY]: next });
  } catch (_) {
    // Diagnostics are best-effort only.
  }
}

async function recordDiagnosticSync(name, status, details) {
  const { [DIAG_SYNC_KEY]: stored } = await chrome.storage.local.get([DIAG_SYNC_KEY]);
  const stats = stored || {};
  stats[name] = {
    status,
    details: details || null,
    at: Date.now(),
  };
  try {
    await setLocalWithQuotaGuard({
      [DIAG_SYNC_KEY]: stats,
      [DIAG_LAST_SYNC_KEY]: Date.now(),
    });
  } catch (_) {
    // Diagnostics are best-effort only.
  }
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
  try {
    console.error("[DiagError]", entry.context, entry.code, entry.rawMessage, entry.meta || null);
  } catch (_) {
    // Ignore console failures.
  }
  if (options.syncName) {
    await recordDiagnosticSync(options.syncName, "error", {
      code: entry.code,
      message: entry.message,
      context: entry.context,
      status: entry.status,
      step: entry?.meta?.step || null,
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

async function safeHandleError(err, context, meta, options = {}) {
  try {
    return await handleError(err, context, meta, options);
  } catch (handlerErr) {
    const entry = normalizeError(err, context, meta);
    const handlerFailure = String(
      handlerErr?.message || handlerErr || "Diagnostic error handling failed."
    );
    const metaDetails =
      entry.meta && typeof entry.meta === "object" && !Array.isArray(entry.meta)
        ? { ...entry.meta, errorHandlerFailure: handlerFailure }
        : { errorHandlerFailure: handlerFailure };
    const fallback = {
      ...entry,
      meta: metaDetails,
    };
    try {
      console.error("[DiagErrorFallback]", fallback.context, fallback.code, fallback.rawMessage, {
        handlerFailure,
        meta: entry.meta || null,
      });
    } catch (_) {
      // Ignore console failures.
    }
    return fallback;
  }
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
        try {
          await recordDiagnosticSync(options.syncName, "ok", details);
        } catch (_) {
          // Diagnostics must never block the response channel.
        }
      }
      try {
        sendResponse(value);
      } catch (_) {
        // The sender may already be gone; do not crash the worker.
      }
    })
    .catch(async (err) => {
      const entry = await safeHandleError(err, context, options.meta, {
        notify: !!options.notify,
        syncName: options.syncName,
      });
      try {
        sendResponse({
          ok: false,
          error: entry.message,
          rawError: entry.rawMessage,
          code: entry.code,
          context: entry.context,
          meta: entry.meta || null,
        });
      } catch (_) {
        // The sender may already be gone; do not crash the worker.
      }
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
    if (err && typeof err === "object") {
      const existingMeta = err.meta && typeof err.meta === "object" ? err.meta : {};
      err.meta = {
        ...existingMeta,
        notionPath: path,
        notionMethod: method,
      };
    }
    if (err?.status === 404 && path.startsWith("databases/")) {
      throw makeError(
        "Base Notion introuvable (verifie l'ID et le partage).",
        "NOTION_DB_NOT_FOUND",
        404,
        { path, notionMethod: method }
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

function stableFocusRuleId(rule) {
  const text = normalizeText(rule).toLowerCase();
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) {
    hash = (hash * 31 + text.charCodeAt(i)) >>> 0;
  }
  return FOCUS_DNR_BASE_ID + (hash % FOCUS_DNR_RANGE);
}

function normalizeBlockedRuleToUrlFilter(rule) {
  const text = normalizeText(rule).toLowerCase();
  if (!text) return "";
  if (text.startsWith("||")) return text;
  if (text.startsWith("http://") || text.startsWith("https://")) {
    try {
      const u = new URL(text);
      return `||${u.hostname}^`;
    } catch (_) {
      return "";
    }
  }
  const host = text.replace(/^\/+|\/+$/g, "");
  return host ? `||${host}^` : "";
}

function normalizeBlockedRules(rawRules) {
  const normalized = [];
  const seen = new Set();
  for (const rule of rawRules || []) {
    const filter = normalizeBlockedRuleToUrlFilter(rule);
    if (!filter || seen.has(filter)) continue;
    seen.add(filter);
    normalized.push(filter);
  }
  return normalized;
}

function getFocusUrlFilters(state) {
  return isFocusBlockingActive(state) ? normalizeBlockedRules(state.blockedRules) : [];
}

function normalizeRawUrlBlockerRules(rawRules) {
  const cleaned = [];
  const seen = new Set();
  for (const rule of rawRules || []) {
    const value = normalizeText(rule);
    if (!value || seen.has(value)) continue;
    seen.add(value);
    cleaned.push(value);
  }
  return cleaned;
}

function normalizeUrlBlockerLogEntry(entry) {
  const normalized = entry && typeof entry === "object" ? { ...entry } : {};
  const tsValue = Number.parseInt(normalized.ts, 10);
  normalized.ts = Number.isFinite(tsValue) ? tsValue : Date.now();
  normalized.url = normalizeText(normalized.url || "");
  normalized.type = normalizeText(normalized.type || "unknown");
  normalized.action = normalizeText(normalized.action || "blocked");
  normalized.source = normalizeText(normalized.source || "");
  return normalized;
}

function queueUrlBlockerLog(entry) {
  const normalized = normalizeUrlBlockerLogEntry(entry);
  urlBlockerLogChain = urlBlockerLogChain
    .then(async () => {
      const data = await chrome.storage.local.get([URL_BLOCKER_LOGS_KEY]);
      const logs = Array.isArray(data?.[URL_BLOCKER_LOGS_KEY]) ? data[URL_BLOCKER_LOGS_KEY] : [];
      const next = [...logs, normalized];
      if (next.length > URL_BLOCKER_LOG_LIMIT) {
        next.splice(0, next.length - URL_BLOCKER_LOG_LIMIT);
      }
      await chrome.storage.local.set({ [URL_BLOCKER_LOGS_KEY]: next });
    })
    .catch((err) => {
      console.error("URL blocker log append failed", err);
    });
  return urlBlockerLogChain;
}

async function getUrlBlockerState() {
  const data = await chrome.storage.local.get([URL_BLOCKER_ENABLED_KEY, URL_BLOCKER_RULES_KEY]);
  const enabled = data?.[URL_BLOCKER_ENABLED_KEY] !== false;
  const rawRules = normalizeRawUrlBlockerRules(data?.[URL_BLOCKER_RULES_KEY] || []);
  return { enabled, rawRules };
}

async function setUrlBlockerState(payload) {
  const enabled = payload?.enabled !== false;
  const rawRules = normalizeRawUrlBlockerRules(payload?.rawRules || []);
  await chrome.storage.local.set({
    [URL_BLOCKER_ENABLED_KEY]: enabled,
    [URL_BLOCKER_RULES_KEY]: rawRules,
  });
  await applyUrlBlockerRules();
  await checkAllTabsForBlocker();
  return { enabled, rawRules };
}

async function getUrlBlockerLogs() {
  const data = await chrome.storage.local.get([URL_BLOCKER_LOGS_KEY]);
  const logs = Array.isArray(data?.[URL_BLOCKER_LOGS_KEY]) ? data[URL_BLOCKER_LOGS_KEY] : [];
  return logs.map((entry) => normalizeUrlBlockerLogEntry(entry));
}

async function clearUrlBlockerLogs() {
  await chrome.storage.local.set({ [URL_BLOCKER_LOGS_KEY]: [] });
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

function isFocusBlockingActive(state) {
  return (
    !!state &&
    state.isEnabled === true &&
    state.isPaused === false &&
    state.phase === "work"
  );
}

function shouldApplyFocusBlocking(state, focusModeEnabled = true) {
  return focusModeEnabled !== false && isFocusBlockingActive(state);
}

function normalizeFocusState(state, source = "unknown") {
  const remainingSeconds = Number.parseInt(state?.remainingSeconds, 10);
  const totalSeconds = Number.parseInt(state?.totalSeconds, 10);
  const progress = Number.parseFloat(state?.progress);
  return {
    isConnected: source === "local",
    isEnabled: !!state?.isEnabled,
    isPaused: !!state?.isPaused,
    phase: state?.phase === "work" || state?.phase === "shortBreak" ? state.phase : "idle",
    summary: normalizeText(state?.summary || ""),
    remainingSeconds: Number.isFinite(remainingSeconds) ? Math.max(0, remainingSeconds) : 0,
    totalSeconds: Number.isFinite(totalSeconds) ? Math.max(0, totalSeconds) : 0,
    progress: Number.isFinite(progress) ? Math.max(0, Math.min(1, progress)) : 0,
    blockedRules: normalizeRawUrlBlockerRules(Array.isArray(state?.blockedRules) ? state.blockedRules : []),
    serverPort: Number.parseInt(state?.serverPort, 10) || 49172,
    updatedAt: Date.now(),
    source,
  };
}

async function readFocusState() {
  const data = await chrome.storage.local.get([FOCUS_STATE_KEY]);
  return normalizeFocusState(
    data?.[FOCUS_STATE_KEY] || {
      isEnabled: false,
      isPaused: false,
      phase: "idle",
      summary: "",
      remainingSeconds: 0,
      totalSeconds: 0,
      progress: 0,
      blockedRules: [],
    },
    "cached"
  );
}

async function persistFocusState(state, source = "local") {
  const normalized = normalizeFocusState(state, source);
  await chrome.storage.local.set({ [FOCUS_STATE_KEY]: normalized });
  return normalized;
}

async function fetchFocusState() {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FOCUS_FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(`${FOCUS_API_BASE}/focus/state`, {
      method: "GET",
      signal: controller.signal,
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    const normalized = await persistFocusState(json);
    return { ok: true, state: normalized };
  } catch (err) {
    const offlineState = await persistFocusState({
      isEnabled: false,
      isPaused: false,
      phase: "idle",
      summary: "",
      remainingSeconds: 0,
      totalSeconds: 0,
      progress: 0,
      blockedRules: [],
      serverPort: 49172,
    }, "offline");
    return { ok: false, error: err?.message || "focus-unreachable", state: offlineState };
  } finally {
    clearTimeout(timeout);
  }
}

async function syncFocusBlockingRules(state) {
  const { [FOCUS_MODE_ENABLED_KEY]: focusModeEnabled = true } = await chrome.storage.local.get([
    FOCUS_MODE_ENABLED_KEY,
  ]);
  const filters = shouldApplyFocusBlocking(state, focusModeEnabled) ? getFocusUrlFilters(state) : [];
  const existing = await chrome.declarativeNetRequest.getDynamicRules();
  const removeRuleIds = existing
    .filter((r) => r.id >= FOCUS_DNR_BASE_ID && r.id < FOCUS_DNR_BASE_ID + FOCUS_DNR_RANGE)
    .map((r) => r.id);
  const addRules = filters.map((urlFilter, index) => ({
    id: stableFocusRuleId(`${urlFilter}|${index}`),
    priority: 1,
    action: { type: "block" },
    condition: { urlFilter, resourceTypes: ["main_frame", "sub_frame"] },
  }));
  await chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds, addRules });
  return { addRules: addRules.length, removeRuleIds: removeRuleIds.length, filters };
}

async function refreshFocusBridge() {
  if (focusPollInFlight) return focusPollInFlight;
  focusPollInFlight = (async () => {
    const result = await fetchFocusState();
    try {
      const dnr = await syncFocusBlockingRules(result.state);
      await checkAllTabsForBlocker();
      result.dnr = dnr;
    } catch (err) {
      result.dnrError = err?.message || "DNR update failed";
    }
    return result;
  })().finally(() => {
    focusPollInFlight = null;
  });
  return focusPollInFlight;
}

function ensureFocusPolling() {
  if (focusPollTimer) return;
  focusPollTimer = setInterval(() => {
    refreshFocusBridge().catch(() => {});
  }, FOCUS_POLL_MS);
}

function ensureFocusAlarm() {
  chrome.alarms.create(FOCUS_SYNC_ALARM, { periodInMinutes: 0.5 });
}

function bootstrapFocusBridge() {
  ensureFocusAlarm();
  ensureFocusPolling();
  refreshFocusBridge().catch(() => {});
}

async function applyUrlBlockerRules() {
  const {
    [URL_BLOCKER_ENABLED_KEY]: enabled = true,
    [URL_BLOCKER_RULES_KEY]: rawRules = [],
    [FOCUS_MODE_ENABLED_KEY]: focusModeEnabled = true,
    [FOCUS_STATE_KEY]: focusState = null,
  } = await chrome.storage.local.get([
    URL_BLOCKER_ENABLED_KEY,
    URL_BLOCKER_RULES_KEY,
    FOCUS_MODE_ENABLED_KEY,
    FOCUS_STATE_KEY,
  ]);

  const normalized = normalizeUrlBlockerRules(rawRules);

  const existing = await chrome.declarativeNetRequest.getDynamicRules();
  const removeRuleIds = existing
    .filter((r) => r.id >= URL_BLOCKER_BASE_ID && r.id < URL_BLOCKER_BASE_ID + 10000)
    .map((r) => r.id);

  if (!enabled || !shouldApplyFocusBlocking(focusState, focusModeEnabled)) {
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
  const state = await chrome.storage.local.get([
    URL_BLOCKER_ENABLED_KEY,
    URL_BLOCKER_RULES_KEY,
    URL_BLOCKER_LOGS_KEY,
  ]);
  if (state[URL_BLOCKER_ENABLED_KEY] !== true) {
    await chrome.storage.local.set({ [URL_BLOCKER_ENABLED_KEY]: true });
  }
  if (!Array.isArray(state[URL_BLOCKER_RULES_KEY])) {
    await chrome.storage.local.set({ [URL_BLOCKER_RULES_KEY]: [] });
  }
  if (!Array.isArray(state[URL_BLOCKER_LOGS_KEY])) {
    await chrome.storage.local.set({ [URL_BLOCKER_LOGS_KEY]: [] });
  }
}

async function checkAllTabsForBlocker() {
  let tabs = [];
  try {
    tabs = await chrome.tabs.query({});
  } catch (_) {
    return;
  }

  const {
    [URL_BLOCKER_RULES_KEY]: rawRules = [],
    [URL_BLOCKER_ENABLED_KEY]: enabled = true,
    [FOCUS_STATE_KEY]: focusState = null,
    [FOCUS_MODE_ENABLED_KEY]: focusModeEnabled = true,
  } = await chrome.storage.local.get([
    URL_BLOCKER_RULES_KEY,
    URL_BLOCKER_ENABLED_KEY,
    FOCUS_STATE_KEY,
    FOCUS_MODE_ENABLED_KEY,
  ]);
  const focusBlockingActive = shouldApplyFocusBlocking(focusState, focusModeEnabled);
  const localFilters = enabled && focusBlockingActive ? normalizeUrlBlockerRules(rawRules) : [];
  const focusFilters = focusBlockingActive ? getFocusUrlFilters(focusState) : [];
  const filters = [...localFilters, ...focusFilters];
  if (!filters.length) return;

  for (const tab of tabs) {
    if (tab.id == null || !tab.url) continue;
    if (!shouldBlockUrl(tab.url, filters)) continue;
    queueUrlBlockerLog({
      ts: Date.now(),
      url: tab.url,
      type: "tab",
      action: "closed",
      source: "check-all-tabs",
    });
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
        const raw = String(chrome.runtime.lastError.message || "Connexion Google impossible.");
        reject(makeError(raw, classifyGoogleIdentityError(raw)));
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
    const payload = compactYahooNewsPayload({ fetchedAt: Date.now(), items });
    await setLocalWithQuotaGuard(
      { yahooNews: payload },
      {
        retryPayload: () => ({
          yahooNews: compactYahooNewsPayload(payload, Math.min(10, YAHOO_NEWS_MAX_ITEMS)),
        }),
      }
    );
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
    const payload = compactYahooQuotesPayload({ fetchedAt: Date.now(), bySymbol });
    await setLocalWithQuotaGuard(
      { yahooQuotes: payload },
      {
        retryPayload: () => ({
          yahooQuotes: compactYahooQuotesPayload(payload, Math.min(8, YAHOO_QUOTES_MAX_SYMBOLS)),
        }),
      }
    );
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
    const syncWindow = buildNotionSyncWindowMs();
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
      if (!isDateWithinNotionSyncWindow(date, syncWindow)) {
        const existing = syncMap.pages[r.id];
        if (existing?.eventId) {
          delete syncMap.events[existing.eventId];
        }
        delete syncMap.pages[r.id];
        continue;
      }

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
    const timeMin = toIsoStringLocal(new Date(syncWindow.minMs));
    const timeMax = toIsoStringLocal(new Date(syncWindow.maxMs));
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

    const compactSyncMap = compactNotionSyncMap(syncMap);
    await setLocalWithQuotaGuard(
      { [NOTION_SYNC_MAP]: compactSyncMap },
      {
        retryPayload: () => ({
          [NOTION_SYNC_MAP]: compactNotionSyncMap(syncMap, { aggressive: true }),
        }),
      }
    );
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
  if (/failed to fetch|networkerror|fetch failed|net::/i.test(msg)) {
    return true;
  }
  if (err?.code === "NETWORK_ERROR") {
    return true;
  }
  const status = Number(err?.status);
  if (Number.isFinite(status) && (status === 429 || status >= 500)) {
    return true;
  }
  return false;
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
        map[alarmName] = compactGcalAlarmEntry({
          calendarId,
          calendarSummary,
          eventId: ev.id,
          summary: ev.summary || "Evenement",
          start: start.toISOString(),
          minutesBefore,
          link,
          eventType,
        });
        chrome.alarms.create(alarmName, { when: alarmTime });
      });
    }
  }

  const compactMap = pruneGcalEventMap(map);
  await setLocalWithQuotaGuard(
    { gcalEventMap: compactMap },
    {
      retryPayload: () => ({
        gcalEventMap: pruneGcalEventMap(compactMap, { aggressive: true }),
      }),
    }
  );
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
    cache[cacheKey] = compactGcalEventCacheEntry({ fetchedAt: Date.now(), events: sorted });
    const compactCache = pruneGcalEventCache(cache);
    await setLocalWithQuotaGuard(
      { [GCAL_CACHE_KEY]: compactCache },
      {
        retryPayload: () => ({
          [GCAL_CACHE_KEY]: pruneGcalEventCache(compactCache, { aggressive: true }),
        }),
      }
    );
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
      void setLocalWithQuotaGuard({
        [alarmName]: buildStoredNotificationPayload(
          {
            summary,
            url,
            date,
            hours,
          },
          "deadline"
        ),
      }).catch(() => {});
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

function maskId(value) {
  const text = normalizeText(value || "");
  if (!text) return "";
  if (text.length <= 8) return text;
  return `${text.slice(0, 4)}...${text.slice(-4)}`;
}

function summarizePropertyTypes(props) {
  const out = {};
  Object.entries(props || {}).forEach(([key, prop]) => {
    out[key] = normalizeText(prop?.type || "unknown");
  });
  return out;
}

function mergeErrorMeta(err, meta) {
  if (!err || typeof err !== "object" || !meta || typeof meta !== "object") return;
  const base = err.meta && typeof err.meta === "object" ? err.meta : {};
  err.meta = { ...base, ...meta };
}

function logTodoDebug(level, event, details) {
  const method = level === "error" ? "error" : level === "warn" ? "warn" : "info";
  try {
    console[method]("[TodoNotion]", event, details || {});
  } catch (_) {
    // Ignore console failures.
  }
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

function createNotionQueueId() {
  const rnd = Math.random().toString(16).slice(2);
  return `nq_${Date.now()}_${rnd}`;
}

function normalizeQueuedNotionItem(rawItem) {
  if (!rawItem || typeof rawItem !== "object") return null;
  const payload =
    rawItem.payload && typeof rawItem.payload === "object" ? rawItem.payload : rawItem;
  if (!payload || typeof payload !== "object") return null;
  const attempts = Number.isFinite(rawItem.attempts) ? Math.max(0, rawItem.attempts) : 0;
  const nextAttemptAt = Number.isFinite(rawItem.nextAttemptAt)
    ? Math.max(0, rawItem.nextAttemptAt)
    : 0;
  return {
    id: rawItem.id || createNotionQueueId(),
    payload: compactQueuedNotionPayload(payload),
    createdAt: Number.isFinite(rawItem.createdAt) ? rawItem.createdAt : Date.now(),
    attempts,
    nextAttemptAt,
    lastError: normalizeText(rawItem.lastError || ""),
  };
}

async function enqueueNotionUpsert(payload) {
  const normalized = normalizeQueuedNotionItem({ payload, createdAt: Date.now(), attempts: 0 });
  if (!normalized) throw new Error("Payload stage invalide.");
  const { [OFFLINE_QUEUE_KEY]: queue } = await chrome.storage.local.get([OFFLINE_QUEUE_KEY]);
  const next = Array.isArray(queue) ? queue.slice() : [];
  next.push(normalized);
  await setLocalWithQuotaGuard({ [OFFLINE_QUEUE_KEY]: next });
  return next.length;
}

async function enqueueRejectedStage(payload) {
  const stageId = normalizeText(payload?.id || payload?.stageId || "");
  if (!stageId) throw new Error("Stage ID manquant.");

  const company = normalizeText(payload?.company || "");
  const title = normalizeText(payload?.title || "");
  const status = normalizeText(payload?.status || "Refus\u00e9");
  const url = normalizeText(payload?.url || "");
  const source = normalizeText(payload?.source || "stage-detail");
  const label = [company, title].filter(Boolean).join(" - ") || title || company || "Stage";

  const { [REJECTED_STAGE_QUEUE_KEY]: queue } = await chrome.storage.local.get([
    REJECTED_STAGE_QUEUE_KEY,
  ]);
  const next = Array.isArray(queue) ? queue.slice() : [];
  next.push(
    compactRejectedStageQueueItem({
      id: createNotionQueueId(),
      stageId,
      company,
      title,
      status,
      url,
      source,
      label,
      queuedAt: Date.now(),
    })
  );
  await setLocalWithQuotaGuard({ [REJECTED_STAGE_QUEUE_KEY]: next });

  notifyUser("Stage refuse", `${label} ajoute a la queue.`, "stage-refuse");
  return { ok: true, count: next.length, label };
}

async function updateNotionQueueHead(mode, replacement) {
  const { [OFFLINE_QUEUE_KEY]: queue } = await chrome.storage.local.get([OFFLINE_QUEUE_KEY]);
  const next = Array.isArray(queue) ? queue.slice() : [];
  if (!next.length) {
    return 0;
  }
  if (mode === "shift") {
    next.shift();
  } else if (mode === "replace") {
    next[0] = replacement;
  }
  await setLocalWithQuotaGuard({ [OFFLINE_QUEUE_KEY]: next });
  return next.length;
}

function computeNotionRetryDelayMs(attempts) {
  const safeAttempts = Math.max(1, Number.isFinite(attempts) ? attempts : 1);
  const exp = Math.min(7, safeAttempts - 1);
  const delay = NOTION_QUEUE_RETRY_BASE_MS * 2 ** exp;
  return Math.min(NOTION_QUEUE_RETRY_MAX_MS, delay);
}

function triggerNotionQueueWorker() {
  processNotionQueue().catch((err) => {
    handleError(err, "Queue Notion - traitement", null, { syncName: "offlineQueue" });
  });
}

function broadcastNotionQueueEvent(eventName, payload, extra = {}) {
  const company = normalizeText(payload?.company || "");
  const title = normalizeText(payload?.title || "");
  const fallback = normalizeText(payload?.url || "");
  const label = [company, title].filter(Boolean).join(" - ") || fallback || "Stage";
  const message = {
    type: "NOTION_QUEUE_EVENT",
    payload: {
      event: eventName,
      company,
      title,
      label,
      at: Date.now(),
      ...extra,
    },
  };
  try {
    chrome.runtime.sendMessage(message, () => {
      void chrome.runtime?.lastError;
    });
  } catch (_) {
    // No active extension page listening.
  }
}

async function processNotionQueue() {
  if (notionQueueWorkerInFlight) return notionQueueWorkerInFlight;

  notionQueueWorkerInFlight = (async () => {
    while (true) {
      const { [OFFLINE_QUEUE_KEY]: queue } = await chrome.storage.local.get([OFFLINE_QUEUE_KEY]);
      const items = Array.isArray(queue) ? queue : [];
      if (!items.length) {
        return;
      }

      const item = normalizeQueuedNotionItem(items[0]);
      if (!item) {
        await updateNotionQueueHead("shift");
        continue;
      }

      if (item.nextAttemptAt && item.nextAttemptAt > Date.now()) {
        return;
      }

      try {
        const saved = await upsertToNotionNow(item.payload);
        broadcastNotionQueueEvent("notion_saved", item.payload, {
          mode: normalizeText(saved?.mode || "created"),
        });
        await updateNotionQueueHead("shift");
      } catch (err) {
        if (isNetworkError(err)) {
          const nextAttempts = item.attempts + 1;
          const waitMs = computeNotionRetryDelayMs(nextAttempts);
          const retryItem = {
            ...item,
            attempts: nextAttempts,
            nextAttemptAt: Date.now() + waitMs,
            lastError: String(err?.message || err || ""),
          };
          await updateNotionQueueHead("replace", retryItem);
          await handleError(err, "Queue Notion - retry en attente", null, {
            syncName: "offlineQueue",
          });
          return;
        }

        await updateNotionQueueHead("shift");
        await handleError(err, "Queue Notion - element ignore", null, {
          syncName: "offlineQueue",
        });
      }
    }
  })();

  try {
    await notionQueueWorkerInFlight;
  } finally {
    notionQueueWorkerInFlight = null;
  }
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

  const queueCount = await enqueueNotionUpsert(payload);
  triggerNotionQueueWorker();
  return {
    ok: true,
    mode: "queued",
    queueCount,
  };
}

async function upsertToNotionNow(payload) {
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
  }
  await notionFetch(token, "pages", "POST", {
    parent: { database_id: normalizedDbId },
    properties,
  });
  await invalidateStageSnapshot();
  scheduleStageSnapshotRefresh(150);
  return { ok: true, mode: "created" };
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

function buildStageTextProperty(prop, value) {
  const text = normalizeText(value || "");
  if (!prop?.type) return null;
  if (prop.type === "title") {
    return { title: text ? [{ text: { content: text } }] : [] };
  }
  if (prop.type === "rich_text") {
    return { rich_text: text ? [{ text: { content: text } }] : [] };
  }
  if (prop.type === "url") {
    return { url: text || null };
  }
  if (prop.type === "date") {
    const parsed = parseDateFromText(text);
    return { date: parsed ? { start: parsed } : null };
  }
  if (prop.type === "select") {
    return { select: text ? { name: text } : null };
  }
  if (prop.type === "status") {
    return { status: text ? { name: text } : null };
  }
  return null;
}

function buildStageRoleProperty(prop, value) {
  const text = normalizeText(value || "");
  if (!prop?.type) return null;
  if (prop.type === "multi_select") {
    const values = text
      .split(",")
      .map((entry) => normalizeText(entry))
      .filter(Boolean);
    return { multi_select: values.map((name) => ({ name })) };
  }
  return buildStageTextProperty(prop, text);
}

async function updateStageFields(payload) {
  const { notionToken: token, notionDbId: dbId } = await chrome.storage.sync.get([
    "notionToken",
    "notionDbId",
  ]);
  const { notionFieldMap } = await chrome.storage.sync.get(["notionFieldMap"]);
  const map = notionFieldMap || {};

  if (!token || !dbId) throw new Error("Config Notion manquante (Options).");
  const pageId = normalizeText(payload?.id || "");
  if (!pageId) throw new Error("Stage ID manquant.");

  const normalizedDbId = normalizeDbId(dbId);
  if (!normalizedDbId) {
    throw new Error("Invalid database ID. Please paste the database URL or ID in Options.");
  }

  const db = await notionFetch(token, `databases/${normalizedDbId}`, "GET");
  const properties = {};
  const fieldDefs = [
    { payloadKey: "title", notionKey: map.jobTitle || "Job Title", builder: buildStageTextProperty },
    { payloadKey: "company", notionKey: map.company || "Entreprise", builder: buildStageTextProperty },
    { payloadKey: "location", notionKey: map.location || "Lieu", builder: buildStageTextProperty },
    { payloadKey: "url", notionKey: map.url || "lien offre", builder: buildStageTextProperty },
    { payloadKey: "status", notionKey: map.status || "Status", builder: buildStageTextProperty },
    { payloadKey: "role", notionKey: map.role || "Role", builder: buildStageRoleProperty },
    { payloadKey: "type", notionKey: map.type || "Type d'infrastructure", builder: buildStageTextProperty },
    {
      payloadKey: "applicationDate",
      notionKey: map.applicationDate || "Application Date",
      builder: buildStageTextProperty,
    },
    { payloadKey: "startMonth", notionKey: map.startMonth || "Start month", builder: buildStageTextProperty },
    { payloadKey: "openDate", notionKey: map.openDate || "Date d'ouverture", builder: buildStageTextProperty },
    { payloadKey: "closeDate", notionKey: map.closeDate || "Date de fermeture", builder: buildStageTextProperty },
    { payloadKey: "notes", notionKey: map.notes || "Notes", builder: buildStageTextProperty },
  ];

  fieldDefs.forEach(({ payloadKey, notionKey, builder }) => {
    if (!Object.prototype.hasOwnProperty.call(payload || {}, payloadKey)) return;
    const prop = db.properties?.[notionKey];
    if (!prop) return;
    const patch = builder(prop, payload?.[payloadKey]);
    if (patch) {
      properties[notionKey] = patch;
    }
  });

  if (!Object.keys(properties).length) {
    throw new Error("Aucune mise a jour applicable.");
  }

  await notionFetch(token, `pages/${pageId}`, "PATCH", { properties });
  await invalidateStageSnapshot();
  scheduleStageSnapshotRefresh(150);
  const refreshed = await getStageById(pageId);
  return { ok: true, item: refreshed?.item || { id: pageId } };
}

async function getStageStatusOptions() {
  const config = await getStageConfig();
  const schemaInfo = await getStageSchemaCached(config, { force: false });
  const statusKey = config.map.status || "Status";
  const statusProp = schemaInfo?.schema?.properties?.[statusKey];
  const options = statusPropOptions(statusProp)
    .map((opt) => normalizeText(opt?.name || ""))
    .filter(Boolean);
  return {
    ok: true,
    options,
    cached: !!schemaInfo?.cached,
    propertyType: normalizeText(statusProp?.type || ""),
  };
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

  const statusNorm = statusRaw.toLowerCase();
  const defaultOpen = "Ouvert";
  const defaultRejected = "Refus\u00e9";
  const defaultApplied = "Candidature envoyee";
  const defaultInterview = "Entretien";

  let preferredStatus = statusRaw;
  let fallbackStatuses = [];
  const isInterviewFinishedRequested = isInterviewFinishedStatusNorm(statusNorm);
  if (statusNorm.startsWith("ouv")) {
    preferredStatus = statusMap.open || defaultOpen;
    fallbackStatuses = [defaultOpen, "Open"];
  } else if (statusNorm.includes("refus") || statusNorm.includes("recal")) {
    preferredStatus = statusMap.rejected || defaultRejected;
    fallbackStatuses = [
      defaultRejected,
      "Refuse",
      "Refusee",
      "Refus?",
      "Recale",
      "Recal\u00e9",
      "Refused",
    ];
  } else if (statusNorm.includes("candid")) {
    preferredStatus = statusMap.applied || defaultApplied;
    fallbackStatuses = [
      defaultApplied,
      "Candidature envoy\u00e9e",
      "Postule",
      "Postul\u00e9",
      "Applied",
    ];
  } else if (isInterviewFinishedRequested) {
    preferredStatus = statusRaw;
    fallbackStatuses = [
      "Entretien finished",
      "Interview finished",
      "Entretien termine",
      "Entretien termin\u00e9",
      "Entretien done",
    ];
  } else if (statusNorm.includes("entre")) {
    preferredStatus = statusMap.interview || defaultInterview;
    fallbackStatuses = [defaultInterview, "Interview"];
  }

  const value =
    statusProp.type === "status" || statusProp.type === "select"
      ? resolveTodoStatusName(statusProp, preferredStatus, fallbackStatuses)
      : preferredStatus;
  let resolvedValue = value;
  if (
    (statusProp.type === "status" || statusProp.type === "select") &&
    statusNorm.includes("entre") &&
    !isInterviewFinishedRequested
  ) {
    const interviewOption = statusPropOptions(statusProp)
      .map((opt) => normalizeText(opt?.name || ""))
      .find((name) => {
        const lowered = name.toLowerCase();
        return lowered.includes("entre") || lowered.includes("interview");
      });
    if (interviewOption) {
      resolvedValue = interviewOption;
    }
  }

  let propPayload = null;
  if (statusProp.type === "status") {
    propPayload = { [statusKey]: { status: { name: resolvedValue } } };
  } else if (statusProp.type === "select") {
    propPayload = { [statusKey]: { select: { name: resolvedValue } } };
  } else if (statusProp.type === "rich_text" || statusProp.type === "title") {
    propPayload = { [statusKey]: { rich_text: [{ text: { content: resolvedValue } }] } };
  } else {
    throw new Error("Type de colonne Status non supporte.");
  }

  const applicationDateKey = map.applicationDate || "Application Date";

  // Auto-transition side effect: set application date when candidacy is sent.
  if (normalizeStageStatusForAutomation(resolvedValue) === "candidature") {
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

  const nextKind = normalizeStageStatusForAutomation(resolvedValue);
  let rejectedQueue = null;
  let linkedTodoSync = null;
  if (nextKind === "refuse") {
    const jobTitleKey = map.jobTitle || "Job Title";
    const companyKey = map.company || "Entreprise";
    const urlKey = map.url || "lien offre";
    try {
      const queueRes = await enqueueRejectedStage({
        id: pageId,
        title: propText(props[jobTitleKey]) || propText(props["Name"]) || "",
        company: propText(props[companyKey]) || "",
        url: propText(props[urlKey]) || "",
        status: resolvedValue,
        source: "status-update",
      });
      rejectedQueue = { ok: true, count: Number(queueRes?.count || 0) };
    } catch (queueErr) {
      await handleError(
        queueErr,
        "Queue - stage refuse auto",
        { id: pageId },
        { syncName: "rejectedStageQueue" }
      );
      rejectedQueue = {
        ok: false,
        error: String(queueErr?.message || queueErr || "inconnue"),
      };
    }
  }

  if (isOaDoneStageStatus(resolvedValue) && !payload?.skipLinkedTodoDone) {
    try {
      linkedTodoSync = await markLinkedStageOaTodosDone(pageId);
    } catch (todoErr) {
      linkedTodoSync = {
        ok: false,
        error: String(todoErr?.message || todoErr || "inconnue"),
      };
    }
  }

  await invalidateStageSnapshot();
  scheduleStageSnapshotRefresh(150);
  return {
    ok: true,
    previousStatus: previousRaw,
    newStatus: resolvedValue,
    statusKind: nextKind,
    rejectedQueue,
    linkedTodoSync,
  };
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
  if (!token || !dbId) {
    throw makeError("Config Todo Notion manquante (Options).", "NOTION_TODO_CONFIG_MISSING");
  }
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

function isRejectedStatus(norm) {
  const value = normalizeStatus(norm);
  return (
    value === "recal?" ||
    value === "recale" ||
    value.includes("refus") ||
    value.includes("recal") ||
    value.includes("reject") ||
    value.includes("rejet")
  );
}

function isAppliedStatus(norm) {
  if (isRejectedStatus(norm)) return false;
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
    if (isRejectedStatus(norm)) {
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
  try {
    await setLocalWithQuotaGuard({
      [STAGE_STATS_CACHE_KEY]: { at: Date.now(), data: result },
    });
  } catch (_) {
    // Skip cache write if storage is under pressure.
  }
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
  try {
    await setLocalWithQuotaGuard({
      [STAGE_SCHEMA_CACHE_KEY]: {
        at: Date.now(),
        dbId: config.dbId,
        schema,
      },
    });
  } catch (_) {
    // Skip cache write if storage is under pressure.
  }
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

function trimStorageText(value, maxLength) {
  const text = normalizeText(value || "");
  if (!maxLength || text.length <= maxLength) return text;
  return `${text.slice(0, Math.max(0, maxLength - 1))}…`;
}

function sameStorageValue(a, b) {
  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch (_) {
    return false;
  }
}

function parseStoredIsoDateMs(value) {
  const iso = parseDateFromText(value || "");
  if (!iso) return 0;
  const ms = new Date(`${iso}T12:00:00`).getTime();
  return Number.isFinite(ms) ? ms : 0;
}

function buildNotionSyncWindowMs(options = {}) {
  const lookbackDays = Number.isFinite(options.lookbackDays)
    ? Math.max(0, Math.floor(options.lookbackDays))
    : NOTION_SYNC_LOOKBACK_DAYS;
  const lookaheadDays = Number.isFinite(options.lookaheadDays)
    ? Math.max(0, Math.floor(options.lookaheadDays))
    : NOTION_SYNC_LOOKAHEAD_DAYS;
  const anchor = new Date();
  anchor.setHours(12, 0, 0, 0);
  const min = new Date(anchor);
  min.setDate(min.getDate() - lookbackDays);
  const max = new Date(anchor);
  max.setDate(max.getDate() + lookaheadDays);
  return { minMs: min.getTime(), maxMs: max.getTime() };
}

function isDateWithinNotionSyncWindow(value, windowMs = buildNotionSyncWindowMs()) {
  const dateMs = parseStoredIsoDateMs(value);
  if (!dateMs) return false;
  return dateMs >= windowMs.minMs && dateMs <= windowMs.maxMs;
}

function notionSyncEntrySortValue(entry) {
  const updatedAt = Number.isFinite(entry?.updatedAt) ? entry.updatedAt : 0;
  const createdAt = Number.isFinite(entry?.createdAt) ? entry.createdAt : 0;
  return Math.max(updatedAt, createdAt, parseStoredIsoDateMs(entry?.date || ""));
}

function compactNotionSyncMap(raw, options = {}) {
  const aggressive = !!options.aggressive;
  const maxEntries = aggressive
    ? NOTION_SYNC_MAP_FALLBACK_ENTRIES
    : NOTION_SYNC_MAP_MAX_ENTRIES;
  const fallbackRetentionMs = (aggressive ? 7 : 30) * 24 * 60 * 60 * 1000;
  const now = Date.now();
  const windowMs = buildNotionSyncWindowMs(options);

  const pages = Object.entries(raw?.pages || {})
    .map(([pageId, value]) => {
      const normalizedPageId = trimStorageText(pageId, 96);
      const eventId = trimStorageText(value?.eventId, 128);
      if (!normalizedPageId || !eventId) return null;
      const entry = {
        eventId,
        calendarId: trimStorageText(value?.calendarId, 128),
        date: parseDateFromText(value?.date || "") || "",
        createdAt: Number.isFinite(value?.createdAt) ? value.createdAt : 0,
        updatedAt: Number.isFinite(value?.updatedAt) ? value.updatedAt : 0,
      };
      const dateMs = parseStoredIsoDateMs(entry.date);
      const sortValue = notionSyncEntrySortValue(entry);
      const keepByDate = dateMs && dateMs >= windowMs.minMs && dateMs <= windowMs.maxMs;
      const keepByActivity = !dateMs && sortValue > now - fallbackRetentionMs;
      if (!keepByDate && !keepByActivity) return null;
      return [normalizedPageId, entry];
    })
    .filter(Boolean)
    .sort((a, b) => notionSyncEntrySortValue(b[1]) - notionSyncEntrySortValue(a[1]))
    .slice(0, maxEntries);

  const compactPages = Object.fromEntries(pages);
  const events = {};
  pages.forEach(([pageId, entry]) => {
    if (entry?.eventId) {
      events[entry.eventId] = pageId;
    }
  });
  return { pages: compactPages, events };
}

function normalizeSyncMap(raw) {
  return compactNotionSyncMap(raw);
}

function compactQueuedNotionPayload(payload) {
  return {
    title: trimStorageText(payload?.title, 220),
    company: trimStorageText(payload?.company, 160),
    location: trimStorageText(payload?.location, 160),
    url: trimStorageText(payload?.url, 1024),
    applied: !!payload?.applied,
    datePosted: trimStorageText(payload?.datePosted, 40),
    startDate: trimStorageText(payload?.startDate, 40),
    role: trimStorageText(payload?.role, 160),
    type: trimStorageText(payload?.type, 120),
    deadline: trimStorageText(payload?.deadline, 40),
  };
}

function compactRejectedStageQueueItem(entry) {
  return {
    id: trimStorageText(entry?.id, 64) || createNotionQueueId(),
    stageId: trimStorageText(entry?.stageId, 96),
    company: trimStorageText(entry?.company, 160),
    title: trimStorageText(entry?.title, 220),
    status: trimStorageText(entry?.status, 120),
    url: trimStorageText(entry?.url, 1024),
    source: trimStorageText(entry?.source, 48),
    label: trimStorageText(entry?.label, 260),
    queuedAt: Number.isFinite(entry?.queuedAt) ? entry.queuedAt : Date.now(),
  };
}

function compactYahooNewsPayload(raw, maxItems = YAHOO_NEWS_MAX_ITEMS) {
  const limit = Number.isFinite(maxItems) ? Math.max(1, Math.floor(maxItems)) : YAHOO_NEWS_MAX_ITEMS;
  const items = Array.isArray(raw?.items)
    ? raw.items.slice(0, limit).map((item) => ({
        title: trimStorageText(item?.title, 180),
        link: trimStorageText(item?.link, 1024),
        pubDate: trimStorageText(item?.pubDate, 96),
        description: trimStorageText(item?.description, 320),
      }))
    : [];
  return {
    fetchedAt: Number.isFinite(raw?.fetchedAt) ? raw.fetchedAt : Date.now(),
    items,
  };
}

function compactYahooQuotesPayload(raw, maxSymbols = YAHOO_QUOTES_MAX_SYMBOLS) {
  const limit =
    Number.isFinite(maxSymbols) ? Math.max(1, Math.floor(maxSymbols)) : YAHOO_QUOTES_MAX_SYMBOLS;
  const entries = Object.entries(raw?.bySymbol || {})
    .sort(
      (a, b) =>
        (Number.isFinite(b?.[1]?.updatedAt) ? b[1].updatedAt : 0) -
        (Number.isFinite(a?.[1]?.updatedAt) ? a[1].updatedAt : 0)
    )
    .slice(0, limit)
    .map(([symbol, value]) => [
      trimStorageText(symbol, 32),
      {
        symbol: trimStorageText(value?.symbol || symbol, 32),
        price: Number.isFinite(value?.price) ? value.price : null,
        changePercent: Number.isFinite(value?.changePercent) ? value.changePercent : null,
        currency: trimStorageText(value?.currency, 24),
        updatedAt: Number.isFinite(value?.updatedAt) ? value.updatedAt : Date.now(),
      },
    ]);
  return {
    fetchedAt: Number.isFinite(raw?.fetchedAt) ? raw.fetchedAt : Date.now(),
    bySymbol: Object.fromEntries(entries),
  };
}

function compactGcalEventForStorage(item) {
  return {
    id: trimStorageText(item?.id, 128),
    summary: trimStorageText(item?.summary, 180),
    location: trimStorageText(item?.location, 180),
    start: trimStorageText(item?.start, 64),
    end: trimStorageText(item?.end, 64),
    calendarId: trimStorageText(item?.calendarId, 128),
    calendarSummary: trimStorageText(item?.calendarSummary, 120),
    htmlLink: trimStorageText(item?.htmlLink, 768),
    sourceUrl: trimStorageText(item?.sourceUrl, 768),
    description: trimStorageText(item?.description, 320),
    attendees: Array.isArray(item?.attendees)
      ? item.attendees.map((entry) => trimStorageText(entry, 120)).filter(Boolean).slice(0, 5)
      : [],
    meetingLink: trimStorageText(item?.meetingLink, 768),
    sourceType: trimStorageText(item?.sourceType, 24),
    eventType: trimStorageText(item?.eventType, 32),
    tags: Array.isArray(item?.tags)
      ? item.tags.map((entry) => trimStorageText(entry, 48)).filter(Boolean).slice(0, 4)
      : [],
  };
}

function compactGcalEventCacheEntry(entry, maxEvents = GCAL_CACHE_MAX_EVENTS_PER_BUCKET) {
  const limit =
    Number.isFinite(maxEvents)
      ? Math.max(1, Math.floor(maxEvents))
      : GCAL_CACHE_MAX_EVENTS_PER_BUCKET;
  const events = Array.isArray(entry?.events) ? entry.events : [];
  return {
    fetchedAt: Number.isFinite(entry?.fetchedAt) ? entry.fetchedAt : Date.now(),
    events: events.slice(0, limit).map(compactGcalEventForStorage),
  };
}

function pruneGcalEventCache(cache, options = {}) {
  const aggressive = !!options.aggressive;
  const maxBuckets = aggressive ? GCAL_CACHE_FALLBACK_BUCKETS : GCAL_CACHE_MAX_BUCKETS;
  const maxEvents = aggressive
    ? GCAL_CACHE_FALLBACK_EVENTS_PER_BUCKET
    : GCAL_CACHE_MAX_EVENTS_PER_BUCKET;
  const now = Date.now();
  const entries = Object.entries(cache && typeof cache === "object" ? cache : {})
    .map(([key, value]) => [key, compactGcalEventCacheEntry(value, maxEvents)])
    .filter(([, value]) => {
      if (!Array.isArray(value?.events) || value.events.length === 0) return false;
      const fetchedAt = Number.isFinite(value?.fetchedAt) ? value.fetchedAt : 0;
      return fetchedAt > 0 && now - fetchedAt < GCAL_CACHE_TTL_MS;
    })
    .sort((a, b) => b[1].fetchedAt - a[1].fetchedAt)
    .slice(0, maxBuckets);
  return Object.fromEntries(entries);
}

function compactGcalAlarmEntry(entry) {
  return {
    calendarId: trimStorageText(entry?.calendarId, 128),
    calendarSummary: trimStorageText(entry?.calendarSummary, 120),
    eventId: trimStorageText(entry?.eventId, 128),
    summary: trimStorageText(entry?.summary, 180),
    start: trimStorageText(entry?.start, 64),
    minutesBefore: Number.isFinite(entry?.minutesBefore) ? entry.minutesBefore : 0,
    link: trimStorageText(entry?.link, 768),
    eventType: trimStorageText(entry?.eventType, 32),
    snoozeMinutes: Number.isFinite(entry?.snoozeMinutes) ? entry.snoozeMinutes : undefined,
    sourceNotificationId: trimStorageText(entry?.sourceNotificationId, 160),
  };
}

function gcalAlarmEntrySortValue(entry) {
  const startMs = new Date(entry?.start || 0).getTime();
  if (Number.isFinite(startMs) && startMs > 0) return startMs;
  return Date.now();
}

function pruneGcalEventMap(map, options = {}) {
  const aggressive = !!options.aggressive;
  const activeAlarmNames = options.activeAlarmNames instanceof Set ? options.activeAlarmNames : null;
  const maxEntries = aggressive ? GCAL_EVENT_MAP_FALLBACK_ENTRIES : GCAL_EVENT_MAP_MAX_ENTRIES;
  const now = Date.now();
  const entries = Object.entries(map && typeof map === "object" ? map : {})
    .map(([key, value]) => [key, compactGcalAlarmEntry(value)])
    .filter(([key, value]) => {
      if (!key) return false;
      if (activeAlarmNames && !activeAlarmNames.has(key)) return false;
      const startMs = new Date(value?.start || 0).getTime();
      if (!Number.isFinite(startMs) || startMs <= 0) return true;
      return startMs >= now - GCAL_NOTIFY_WINDOW_MIN * 60 * 1000;
    })
    .sort((a, b) => gcalAlarmEntrySortValue(a[1]) - gcalAlarmEntrySortValue(b[1]))
    .slice(0, maxEntries);
  return Object.fromEntries(entries);
}

function pruneGcalNotifiedState(notified, options = {}) {
  const aggressive = !!options.aggressive;
  const activeAlarmNames = options.activeAlarmNames instanceof Set ? options.activeAlarmNames : null;
  const retentionMs = aggressive ? 60 * 60 * 1000 : GCAL_NOTIFIED_RETENTION_MS;
  const now = Date.now();
  const entries = Object.entries(notified && typeof notified === "object" ? notified : {})
    .filter(([key, value]) => {
      const ts = Number.isFinite(value) ? value : Number.parseInt(value, 10);
      if (activeAlarmNames && activeAlarmNames.has(key)) return true;
      return Number.isFinite(ts) && now - ts < retentionMs;
    })
    .sort((a, b) => {
      const bTs = Number.isFinite(b?.[1]) ? b[1] : Number.parseInt(b?.[1], 10) || 0;
      const aTs = Number.isFinite(a?.[1]) ? a[1] : Number.parseInt(a?.[1], 10) || 0;
      return bTs - aTs;
    })
    .slice(0, GCAL_NOTIFIED_MAX_ENTRIES);
  return Object.fromEntries(entries);
}

function buildStoredNotificationPayload(payload, kind = "default") {
  return {
    ...compactGcalAlarmEntry(payload),
    title: trimStorageText(payload?.title, 180),
    url: trimStorageText(payload?.url, 768),
    date: trimStorageText(payload?.date, 64),
    when: trimStorageText(payload?.when, 64),
    hours: Number.isFinite(payload?.hours) ? payload.hours : undefined,
    notifiedAt: Number.isFinite(payload?.notifiedAt) ? payload.notifiedAt : undefined,
    storedAt: Date.now(),
    notificationKind: trimStorageText(kind, 24),
  };
}

function isAlarmBackedStorageKey(key) {
  return (
    key.startsWith(GCAL_ALARM_PREFIX) ||
    key.startsWith(GCAL_SNOOZE_ALARM_PREFIX) ||
    key.startsWith(DEADLINE_ALARM_PREFIX) ||
    key.startsWith(INTERVIEW_ALARM_PREFIX)
  );
}

function getAlarmBackedStorageTime(key, value) {
  if (!value || typeof value !== "object") return 0;
  const candidates = [value.notifiedAt, value.storedAt, value.start, value.when, value.date];
  for (const candidate of candidates) {
    const direct = Number(candidate);
    if (Number.isFinite(direct) && direct > 0) return direct;
    const parsed = new Date(candidate || 0).getTime();
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  if (key.startsWith(DEADLINE_ALARM_PREFIX)) {
    const parsed = parseDateFromText(value?.date || "");
    if (parsed) {
      const asDate = new Date(`${parsed}T00:00:00`).getTime();
      if (Number.isFinite(asDate) && asDate > 0) return asDate;
    }
  }
  return 0;
}

async function runStorageMaintenance(options = {}) {
  const aggressive = !!options.aggressive;
  const [localData, alarms] = await Promise.all([
    chrome.storage.local.get(null),
    chrome.alarms.getAll(),
  ]);
  const activeAlarmNames = new Set(
    (Array.isArray(alarms) ? alarms : []).map((alarm) => alarm?.name).filter(Boolean)
  );
  const toSet = {};
  const toRemove = [];

  const planObjectUpdate = (key, nextValue) => {
    if (!Object.prototype.hasOwnProperty.call(localData, key)) return;
    const currentValue = localData[key];
    if (
      nextValue &&
      typeof nextValue === "object" &&
      !Array.isArray(nextValue) &&
      Object.keys(nextValue).length === 0
    ) {
      toRemove.push(key);
      return;
    }
    if (!sameStorageValue(currentValue, nextValue)) {
      toSet[key] = nextValue;
    }
  };

  planObjectUpdate(GCAL_CACHE_KEY, pruneGcalEventCache(localData[GCAL_CACHE_KEY], { aggressive }));
  planObjectUpdate(
    "gcalEventMap",
    pruneGcalEventMap(localData.gcalEventMap, { aggressive, activeAlarmNames })
  );
  planObjectUpdate(
    GCAL_NOTIFIED_KEY,
    pruneGcalNotifiedState(localData[GCAL_NOTIFIED_KEY], { aggressive, activeAlarmNames })
  );

  if (Object.prototype.hasOwnProperty.call(localData, "yahooNews")) {
    const nextNews = compactYahooNewsPayload(
      localData.yahooNews,
      aggressive ? Math.min(10, YAHOO_NEWS_MAX_ITEMS) : YAHOO_NEWS_MAX_ITEMS
    );
    if (!nextNews.items.length) {
      toRemove.push("yahooNews");
    } else if (!sameStorageValue(localData.yahooNews, nextNews)) {
      toSet.yahooNews = nextNews;
    }
  }

  if (Object.prototype.hasOwnProperty.call(localData, "yahooQuotes")) {
    const nextQuotes = compactYahooQuotesPayload(
      localData.yahooQuotes,
      aggressive ? Math.min(8, YAHOO_QUOTES_MAX_SYMBOLS) : YAHOO_QUOTES_MAX_SYMBOLS
    );
    if (!Object.keys(nextQuotes.bySymbol || {}).length) {
      toRemove.push("yahooQuotes");
    } else if (!sameStorageValue(localData.yahooQuotes, nextQuotes)) {
      toSet.yahooQuotes = nextQuotes;
    }
  }

  if (Object.prototype.hasOwnProperty.call(localData, NOTION_SYNC_MAP)) {
    const nextSyncMap = compactNotionSyncMap(localData[NOTION_SYNC_MAP], { aggressive });
    if (!Object.keys(nextSyncMap.pages || {}).length) {
      toRemove.push(NOTION_SYNC_MAP);
    } else if (!sameStorageValue(localData[NOTION_SYNC_MAP], nextSyncMap)) {
      toSet[NOTION_SYNC_MAP] = nextSyncMap;
    }
  }

  if (Object.prototype.hasOwnProperty.call(localData, OFFLINE_QUEUE_KEY)) {
    const nextQueue = (Array.isArray(localData[OFFLINE_QUEUE_KEY]) ? localData[OFFLINE_QUEUE_KEY] : [])
      .map((entry) => normalizeQueuedNotionItem(entry))
      .filter(Boolean);
    if (!nextQueue.length) {
      toRemove.push(OFFLINE_QUEUE_KEY);
    } else if (!sameStorageValue(localData[OFFLINE_QUEUE_KEY], nextQueue)) {
      toSet[OFFLINE_QUEUE_KEY] = nextQueue;
    }
  }

  if (Object.prototype.hasOwnProperty.call(localData, REJECTED_STAGE_QUEUE_KEY)) {
    const nextRejected = (
      Array.isArray(localData[REJECTED_STAGE_QUEUE_KEY]) ? localData[REJECTED_STAGE_QUEUE_KEY] : []
    )
      .map((entry) => compactRejectedStageQueueItem(entry))
      .filter((entry) => entry.stageId);
    if (!nextRejected.length) {
      toRemove.push(REJECTED_STAGE_QUEUE_KEY);
    } else if (!sameStorageValue(localData[REJECTED_STAGE_QUEUE_KEY], nextRejected)) {
      toSet[REJECTED_STAGE_QUEUE_KEY] = nextRejected;
    }
  }

  if (Object.prototype.hasOwnProperty.call(localData, STAGE_DASHBOARD_SNAPSHOT_KEY)) {
    const snapshot = localData[STAGE_DASHBOARD_SNAPSHOT_KEY];
    if (snapshot && typeof snapshot === "object") {
      const nextSnapshot = buildStageSnapshotStoragePayload(snapshot, {
        maxItems: aggressive ? STAGE_SNAPSHOT_FALLBACK_ROWS : STAGE_SNAPSHOT_MAX_CACHED_ROWS,
        capped: aggressive ? true : !!snapshot?.capped,
      });
      if (!Array.isArray(nextSnapshot?.allStages) || !nextSnapshot.allStages.length) {
        toRemove.push(STAGE_DASHBOARD_SNAPSHOT_KEY);
      } else if (!sameStorageValue(snapshot, nextSnapshot)) {
        toSet[STAGE_DASHBOARD_SNAPSHOT_KEY] = nextSnapshot;
      }
    } else {
      toRemove.push(STAGE_DASHBOARD_SNAPSHOT_KEY);
    }
  }

  if (Object.prototype.hasOwnProperty.call(localData, STAGE_SCHEMA_CACHE_KEY)) {
    const entry = localData[STAGE_SCHEMA_CACHE_KEY];
    const stale = !entry?.at || Date.now() - entry.at > STAGE_SCHEMA_TTL_MS;
    if (stale) {
      toRemove.push(STAGE_SCHEMA_CACHE_KEY);
    }
  }

  const now = Date.now();
  const retentionMs = aggressive ? 60 * 60 * 1000 : ALARM_STORAGE_RETENTION_MS;
  Object.entries(localData).forEach(([key, value]) => {
    if (!isAlarmBackedStorageKey(key)) return;
    if (activeAlarmNames.has(key)) return;
    const timeRef = getAlarmBackedStorageTime(key, value);
    if (!timeRef || timeRef < now - retentionMs) {
      toRemove.push(key);
    }
  });

  const uniqueToRemove = Array.from(new Set(toRemove));
  if (uniqueToRemove.length) {
    await chrome.storage.local.remove(uniqueToRemove);
  }
  if (Object.keys(toSet).length) {
    await chrome.storage.local.set(toSet);
  }
  return { removedKeys: uniqueToRemove.length, updatedKeys: Object.keys(toSet).length };
}

async function setLocalWithQuotaGuard(payload, options = {}) {
  try {
    await chrome.storage.local.set(payload);
    return { recovered: false };
  } catch (err) {
    if (!isStorageQuotaError(err)) throw err;
  }

  await runStorageMaintenance({ aggressive: true });
  const retryPayload =
    typeof options.retryPayload === "function" ? await options.retryPayload() : payload;
  await chrome.storage.local.set(retryPayload);
  return { recovered: true };
}

async function removeNotificationStorage(notificationId) {
  if (!notificationId) return;
  const removeKeys = [notificationId];
  const data = await chrome.storage.local.get(["gcalEventMap", GCAL_NOTIFIED_KEY]);
  const nextMap = { ...(data?.gcalEventMap || {}) };
  const nextNotified = { ...(data?.[GCAL_NOTIFIED_KEY] || {}) };
  let shouldWrite = false;

  if (Object.prototype.hasOwnProperty.call(nextMap, notificationId)) {
    delete nextMap[notificationId];
    shouldWrite = true;
  }
  if (Object.prototype.hasOwnProperty.call(nextNotified, notificationId)) {
    delete nextNotified[notificationId];
    shouldWrite = true;
  }

  await chrome.storage.local.remove(removeKeys);
  if (shouldWrite) {
    await chrome.storage.local.set({
      gcalEventMap: pruneGcalEventMap(nextMap, { aggressive: true }),
      [GCAL_NOTIFIED_KEY]: pruneGcalNotifiedState(nextNotified, { aggressive: true }),
    });
  }
}

function compactStageItemForStorage(item) {
  return {
    id: trimStorageText(item?.id, 96),
    title: trimStorageText(item?.title, 180),
    company: trimStorageText(item?.company, 160),
    location: trimStorageText(item?.location, 160),
    url: trimStorageText(item?.url, 1024),
    status: trimStorageText(item?.status, 120),
    role: trimStorageText(item?.role, 160),
    type: trimStorageText(item?.type, 120),
    applicationDate: trimStorageText(item?.applicationDate, 40),
    startMonth: trimStorageText(item?.startMonth, 40),
    openDate: trimStorageText(item?.openDate, 40),
    closeDate: trimStorageText(item?.closeDate, 40),
    createdTime: trimStorageText(item?.createdTime, 40),
    lastEditedTime: trimStorageText(item?.lastEditedTime, 40),
  };
}

function stageStorageSortValue(item) {
  return new Date(item?.lastEditedTime || item?.createdTime || 0).getTime() || 0;
}

function compactStageItemsForStorage(items, maxItems = STAGE_SNAPSHOT_MAX_CACHED_ROWS) {
  const list = Array.isArray(items) ? items.map(compactStageItemForStorage) : [];
  if (list.length <= maxItems) return list;
  return list
    .slice()
    .sort((a, b) => stageStorageSortValue(b) - stageStorageSortValue(a))
    .slice(0, maxItems);
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
    if (isRejectedStatus(norm)) {
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

function buildStageSnapshotStoragePayload(snapshot, options = {}) {
  const normalized = normalizeStageSnapshot(snapshot, { source: "network", stale: false });
  const maxItems = Number.isFinite(options.maxItems)
    ? Math.max(25, Math.floor(options.maxItems))
    : STAGE_SNAPSHOT_MAX_CACHED_ROWS;
  const compactAllStages = compactStageItemsForStorage(normalized.allStages, maxItems);
  const capped =
    !!options.capped || !!normalized.capped || compactAllStages.length < normalized.allStages.length;

  return {
    version: normalized.version,
    generatedAt: normalized.generatedAt,
    source: normalized.source,
    stale: normalized.stale,
    total: normalized.total,
    allStages: compactAllStages,
    stats: normalized.stats,
    weeklyKpis: normalized.weeklyKpis,
    instrumentation: {
      ...(normalized.instrumentation || {}),
      cachedRows: compactAllStages.length,
      capped,
    },
    capped,
  };
}

function isStorageQuotaError(err) {
  const message = String(err?.message || err || "");
  return /resource::kquotabytes|quota[_ ]?bytes|quota exceeded/i.test(message);
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
  const primary = buildStageSnapshotStoragePayload(snapshot);
  const fallback = buildStageSnapshotStoragePayload(snapshot, {
    maxItems: STAGE_SNAPSHOT_FALLBACK_ROWS,
    capped: true,
  });

  const writePayload = (payload) => ({
    [STAGE_DASHBOARD_SNAPSHOT_KEY]: payload,
    [STAGE_STATS_CACHE_KEY]: { at: payload.generatedAt, data: payload.stats, capped: !!payload.capped },
  });

  try {
    await setLocalWithQuotaGuard(writePayload(primary));
    return primary;
  } catch (err) {
    if (!isStorageQuotaError(err)) throw err;
  }

  try {
    await setLocalWithQuotaGuard(writePayload(fallback));
    return fallback;
  } catch (err) {
    if (!isStorageQuotaError(err)) throw err;
  }

  await chrome.storage.local.remove([STAGE_DASHBOARD_SNAPSHOT_KEY]);
  await setLocalWithQuotaGuard({
    [STAGE_STATS_CACHE_KEY]: { at: fallback.generatedAt, data: fallback.stats, capped: true },
  });
  return fallback;
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

function findDbPropKeyByKeywords(props, keywords, allowedTypes = []) {
  const terms = (keywords || [])
    .map((term) => normalizeText(term || "").toLowerCase())
    .filter(Boolean);
  if (!terms.length) return "";

  const allowList = Array.isArray(allowedTypes) ? allowedTypes : [];
  return (
    Object.keys(props || {}).find((key) => {
      const label = normalizeText(key || "").toLowerCase();
      if (!label) return false;
      if (!terms.some((term) => label.includes(term))) return false;
      if (!allowList.length) return true;
      return allowList.includes(props?.[key]?.type);
    }) || ""
  );
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
    priorityKey:
      findDbPropKeyByName(props, ["Priority", "Priorite", "Urgence", "Importance"]) ||
      findDbPropKeyByKeywords(props, ["priorit", "urgent", "urgence", "importance"], [
        "select",
        "status",
        "multi_select",
        "number",
        "rich_text",
        "title",
      ]),
    stageKey:
      findDbPropKeyByName(props, [
        "Stage",
        "Internship",
        "Interview Stage",
        "Entretien",
        "Linked Stage",
      ]) ||
      findDbPropKeyByKeywords(props, ["stage", "interview", "entretien"], [
        "relation",
        "rich_text",
        "title",
        "select",
        "status",
        "url",
      ]),
    addedDateKey:
      findDbPropKeyByName(props, ["Date d'ajout", "Date ajout", "Added date", "Created", "Created time"]) ||
      findDbPropKeyByKeywords(props, ["ajout", "added", "created"], ["date", "rich_text"]),
  };
}

function extractTodoPriority(prop) {
  if (!prop || typeof prop !== "object") return "";
  if (prop.type === "number") {
    return Number.isFinite(prop.number) ? String(prop.number) : "";
  }
  if (prop.type === "formula") {
    const formula = prop.formula || {};
    if (formula.type === "number") {
      return Number.isFinite(formula.number) ? String(formula.number) : "";
    }
    if (formula.type === "string") return normalizeText(formula.string || "");
    if (formula.type === "boolean") return formula.boolean ? "true" : "false";
    if (formula.type === "date") return normalizeText(formula.date?.start || "");
  }
  return normalizeText(propText(prop) || "");
}

function extractTodoStageInfo(prop) {
  if (!prop || typeof prop !== "object") {
    return { stageId: "", stageLabel: "", stageLink: "" };
  }

  if (prop.type === "relation") {
    const ids = Array.isArray(prop.relation)
      ? prop.relation.map((entry) => normalizeText(entry?.id || "")).filter(Boolean)
      : [];
    return {
      stageId: ids[0] || "",
      stageLabel: "",
      stageLink: "",
    };
  }

  if (prop.type === "url") {
    const link = normalizeText(prop.url || "");
    return {
      stageId: "",
      stageLabel: link,
      stageLink: link,
    };
  }

  const label = normalizeText(propText(prop) || "");
  return {
    stageId: "",
    stageLabel: label,
    stageLink: "",
  };
}

function inferTodoStageLabelFromTask(task) {
  const normalizedTask = normalizeText(task || "");
  if (!normalizedTask) return "";
  const match = normalizedTask.match(
    /(?:preparation entretien|entretien|interview|oa\s*to\s*do|oa\s*todo|hv\s*to\s*do|hv\s*todo)\s*:\s*(.+)$/i
  );
  return normalizeText(match?.[1] || "");
}

function isOaTodoTask(task) {
  const normalizedTask = normalizeText(task || "").toLowerCase();
  if (!normalizedTask) return false;
  return /^oa\s*to\s*do\b/.test(normalizedTask) || /^oa\s*todo\b/.test(normalizedTask);
}

function isOaDoneStageStatus(status) {
  const normalized = normalizeText(status || "").toLowerCase();
  if (!normalized) return false;
  return normalized === "oa done" || normalized === "oadone";
}

function isInterviewPreparationTodoTask(task) {
  const normalizedTask = normalizeText(task || "").toLowerCase();
  if (!normalizedTask) return false;
  return /^preparation\s+(entretien|interview)\b/.test(normalizedTask);
}

function isInterviewFinishedStatusNorm(statusNorm) {
  return (
    /\b(entretien|interview)\b/.test(statusNorm) &&
    /\b(finished|done|termine|terminee|terminé|terminée)\b/.test(statusNorm)
  );
}

function inferStageLabelFromOaTask(task) {
  const normalizedTask = normalizeText(task || "");
  if (!normalizedTask) return "";
  const match = normalizedTask.match(/(?:oa\s*to\s*do|oa\s*todo|hv\s*to\s*do|hv\s*todo)\s*:\s*(.+)$/i);
  return normalizeText(match?.[1] || "");
}

async function resolveStageIdFromTodoContext({ stageLabel, stageLink, task }) {
  const link = normalizeText(stageLink || "");
  const label =
    normalizeText(stageLabel || "") ||
    inferStageLabelFromOaTask(task || "") ||
    inferTodoStageLabelFromTask(task || "");
  if (!link && !label) return "";

  const snapshot = await getStageSnapshot({ allowStale: true });
  const stages = Array.isArray(snapshot?.allStages) ? snapshot.allStages : [];
  if (!stages.length) return "";

  let bestId = "";
  let bestScore = 0;
  for (const stage of stages) {
    const stageId = normalizeText(stage?.id || "");
    if (!stageId) continue;
    const stageUrl = normalizeText(stage?.url || "");
    const stageTitle = normalizeText(stage?.title || "");
    const stageCompany = normalizeText(stage?.company || "");
    const combined = normalizeText([stageCompany, stageTitle].filter(Boolean).join(" - "));
    let score = 0;

    if (link && stageUrl && sameUrl(link, stageUrl)) {
      score = 2;
    } else if (label) {
      const titleScore = diceCoefficient(label, combined || stageTitle);
      const reverseScore = diceCoefficient(label, normalizeText([stageTitle, stageCompany].join(" - ")));
      score = Math.max(titleScore, reverseScore);
    }

    if (score > bestScore) {
      bestScore = score;
      bestId = stageId;
    }
  }
  if (bestScore >= 0.86 || bestScore >= 2) {
    return bestId;
  }
  return "";
}

async function buildStageSyncContext(stageId, fallback = {}) {
  const baseLabel = normalizeText(fallback?.stageLabel || fallback?.title || "");
  const baseLink = normalizeText(fallback?.stageLink || fallback?.link || "");
  try {
    const res = await getStageById(stageId);
    if (!res?.ok || !res?.item) {
      return { stageLabel: baseLabel, stageLink: baseLink };
    }
    const item = res.item || {};
    const title = normalizeText(item.title || "");
    const company = normalizeText(item.company || "");
    const stageLabel = normalizeText([company, title].filter(Boolean).join(" - ")) || title || baseLabel;
    const stageLink = normalizeText(item.url || "") || baseLink;
    return { stageLabel, stageLink };
  } catch (_) {
    return { stageLabel: baseLabel, stageLink: baseLink };
  }
}

async function markLinkedStageInterviewTodosDone(stageId, context = {}) {
  const normalizedStageId = normalizeText(stageId || "");
  if (!normalizedStageId) {
    return { ok: false, skipped: true, reason: "missing_stage_id" };
  }

  const { notionToken: token, notionTodoDbId: dbId } = await chrome.storage.sync.get([
    "notionToken",
    "notionTodoDbId",
  ]);
  if (!token || !dbId) {
    return { ok: false, skipped: true, reason: "todo_config_missing" };
  }

  const normalizedDbId = normalizeDbId(dbId);
  if (!normalizedDbId) {
    return { ok: false, skipped: true, reason: "todo_db_invalid" };
  }

  const stageLabel = normalizeText(context?.stageLabel || "");
  const stageLink = normalizeText(context?.stageLink || "");
  const db = await notionFetch(token, `databases/${normalizedDbId}`, "GET");
  const props = db.properties || {};
  const todoKeys = resolveTodoDbKeys(props);
  const statusKey = normalizeText(todoKeys.statusKey || "");
  const stageKey = normalizeText(todoKeys.stageKey || "");
  const statusProp = props?.[statusKey];
  const stageProp = props?.[stageKey];

  if (!statusKey || !statusProp) {
    return { ok: false, skipped: true, reason: "todo_status_missing" };
  }

  const doneLabel = resolveTodoDoneName(statusProp, "Done");
  const doneNorm = normalizeText(doneLabel).toLowerCase();
  const andFilters = [];
  if (statusProp.type === "status") {
    andFilters.push({ property: statusKey, status: { does_not_equal: doneLabel } });
  } else if (statusProp.type === "select") {
    andFilters.push({ property: statusKey, select: { does_not_equal: doneLabel } });
  }
  if (stageProp?.type === "relation") {
    andFilters.push({ property: stageKey, relation: { contains: normalizedStageId } });
  }
  const filter = andFilters.length ? { and: andFilters } : null;
  const rows = await listDbRows(token, normalizedDbId, filter);

  let updated = 0;
  for (const row of rows) {
    const mapped = mapTodoPage(row, todoKeys);
    if (!isInterviewPreparationTodoTask(mapped.task || "")) continue;

    const statusNorm = normalizeText(mapped.status || "").toLowerCase();
    if (statusNorm && statusNorm === doneNorm) continue;

    const mappedStageId = normalizeText(mapped.stageId || "");
    const mappedStageLabel = normalizeText(mapped.stageLabel || "");
    const mappedStageLink = normalizeText(mapped.stageLink || "");

    let isLinked = mappedStageId && mappedStageId === normalizedStageId;
    if (!isLinked && stageLink && mappedStageLink) {
      isLinked = sameUrl(stageLink, mappedStageLink);
    }
    if (!isLinked && stageLabel && mappedStageLabel) {
      isLinked =
        diceCoefficient(stageLabel, mappedStageLabel) >= 0.86 ||
        normalizeCompareText(stageLabel) === normalizeCompareText(mappedStageLabel);
    }
    if (!isLinked && stageProp?.type === "relation") {
      isLinked = true;
    }
    if (!isLinked) continue;

    await notionFetch(token, `pages/${row.id}`, "PATCH", {
      properties: {
        [statusKey]: buildTodoStatusProperty(statusProp, doneLabel),
      },
    });
    updated += 1;
  }

  return { ok: true, updated };
}

function mapTodoPage(page, keys) {
  const p = page?.properties || {};
  const resolvedKeys = keys || {};
  const task = propText(p[resolvedKeys.taskKey]) || propText(p["Name"]) || "";
  const notes = propText(p[resolvedKeys.notesKey]) || "";
  const stageInfo = extractTodoStageInfo(p[resolvedKeys.stageKey]);
  const inferredStageLabel = inferTodoStageLabelFromTask(task);

  return {
    id: page?.id || "",
    task,
    status: propText(p[resolvedKeys.statusKey]) || "",
    dueDate: propText(p[resolvedKeys.dueKey]) || "",
    notes,
    addedDate: propText(p[resolvedKeys.addedDateKey]) || page?.created_time || "",
    createdAt: page?.created_time || "",
    priority: extractTodoPriority(p[resolvedKeys.priorityKey]),
    stageId: stageInfo.stageId || "",
    stageLabel: normalizeText(stageInfo.stageLabel || inferredStageLabel || ""),
    stageLink: stageInfo.stageLink || "",
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

function buildTodoPriorityProperty(priorityProp, priorityValue) {
  const value = normalizeText(priorityValue || "");
  if (!value) return null;
  if (!priorityProp || typeof priorityProp !== "object") return null;

  if (priorityProp.type === "select") {
    return { select: { name: value } };
  }
  if (priorityProp.type === "status") {
    return { status: { name: value } };
  }
  if (priorityProp.type === "multi_select") {
    return { multi_select: [{ name: value }] };
  }
  if (priorityProp.type === "number") {
    const lower = value.toLowerCase();
    let num = Number.parseFloat(value);
    if (!Number.isFinite(num)) {
      if (lower === "high") num = 3;
      if (lower === "medium") num = 2;
      if (lower === "low") num = 1;
    }
    if (!Number.isFinite(num)) return null;
    return { number: num };
  }
  if (priorityProp.type === "rich_text") {
    return { rich_text: [{ text: { content: value } }] };
  }
  if (priorityProp.type === "title") {
    return { title: [{ text: { content: value } }] };
  }
  return null;
}

function normalizeRelationIds(value, fallback) {
  const ids = [];
  if (Array.isArray(value)) {
    value.forEach((entry) => {
      const normalized = normalizeText(entry || "");
      if (normalized) ids.push(normalized);
    });
  }
  const single = normalizeText(fallback || "");
  if (single) ids.push(single);
  return Array.from(new Set(ids));
}

function buildTodoStageProperty(stageProp, stageIds, stageLabel, stageLink) {
  if (!stageProp || typeof stageProp !== "object") return null;
  const ids = normalizeRelationIds(stageIds, "");
  const label = normalizeText(stageLabel || "");
  const link = normalizeText(stageLink || "");

  if (stageProp.type === "relation") {
    if (!ids.length) return null;
    return { relation: ids.map((id) => ({ id })) };
  }
  if (stageProp.type === "url") {
    if (!link) return null;
    return { url: link };
  }

  const content = normalizeText(label || link || ids[0] || "");
  if (!content) return null;
  if (stageProp.type === "rich_text") {
    return { rich_text: [{ text: { content } }] };
  }
  if (stageProp.type === "title") {
    return { title: [{ text: { content } }] };
  }
  if (stageProp.type === "select") {
    return { select: { name: content } };
  }
  if (stageProp.type === "status") {
    return { status: { name: content } };
  }
  return null;
}

async function markLinkedStageOaTodosDone(stageId) {
  const normalizedStageId = normalizeText(stageId || "");
  if (!normalizedStageId) {
    return { ok: false, skipped: true, reason: "missing_stage_id" };
  }

  const { notionToken: token, notionTodoDbId: dbId } = await chrome.storage.sync.get([
    "notionToken",
    "notionTodoDbId",
  ]);
  if (!token || !dbId) {
    return { ok: false, skipped: true, reason: "todo_config_missing" };
  }

  const normalizedDbId = normalizeDbId(dbId);
  if (!normalizedDbId) {
    return { ok: false, skipped: true, reason: "todo_db_invalid" };
  }

  const db = await notionFetch(token, `databases/${normalizedDbId}`, "GET");
  const props = db.properties || {};
  const todoKeys = resolveTodoDbKeys(props);
  const statusKey = normalizeText(todoKeys.statusKey || "");
  const stageKey = normalizeText(todoKeys.stageKey || "");
  const statusProp = props?.[statusKey];
  const stageProp = props?.[stageKey];

  if (!statusKey || !statusProp || !stageKey || !stageProp) {
    return { ok: false, skipped: true, reason: "todo_stage_or_status_missing" };
  }
  if (stageProp.type !== "relation") {
    return { ok: false, skipped: true, reason: "todo_stage_not_relation" };
  }

  const doneLabel = resolveTodoDoneName(statusProp, "Done");
  const andFilters = [{ property: stageKey, relation: { contains: normalizedStageId } }];
  if (statusProp.type === "status") {
    andFilters.push({ property: statusKey, status: { does_not_equal: doneLabel } });
  } else if (statusProp.type === "select") {
    andFilters.push({ property: statusKey, select: { does_not_equal: doneLabel } });
  }

  const rows = await listDbRows(token, normalizedDbId, { and: andFilters });
  let updated = 0;
  for (const row of rows) {
    const mapped = mapTodoPage(row, todoKeys);
    if (!isOaTodoTask(mapped.task || "")) continue;
    await notionFetch(token, `pages/${row.id}`, "PATCH", {
      properties: {
        [statusKey]: buildTodoStatusProperty(statusProp, doneLabel),
      },
    });
    updated += 1;
  }

  return { ok: true, updated };
}

async function listNotionTodos() {
  let step = "load_config";
  let normalizedDbId = "";
  let statusKey = "";
  let statusType = "";
  try {
    const { notionToken: token, notionTodoDbId: dbId } = await chrome.storage.sync.get([
      "notionToken",
      "notionTodoDbId",
    ]);
    logTodoDebug("info", "list:start", {
      hasToken: !!token,
      hasDbId: !!dbId,
      rawDbId: maskId(dbId),
    });
    if (!token || !dbId) {
      throw makeError("Config Todo Notion manquante (Options).", "NOTION_TODO_CONFIG_MISSING");
    }

    step = "normalize_db_id";
    normalizedDbId = normalizeDbId(dbId);
    if (!normalizedDbId) {
      throw makeError(
        "Invalid Todo database ID. Please paste the database URL or ID in Options.",
        "NOTION_TODO_DB_ID_INVALID",
        undefined,
        { rawDbId: maskId(dbId) }
      );
    }

    step = "load_database_schema";
    const db = await notionFetch(token, `databases/${normalizedDbId}`, "GET");
    const props = db.properties || {};
    const todoKeys = resolveTodoDbKeys(props);
    statusKey = normalizeText(todoKeys.statusKey || "");

    const statusProp = props?.[statusKey];
    statusType = normalizeText(statusProp?.type || "");
    logTodoDebug("info", "list:schema", {
      dbId: maskId(normalizedDbId),
      propertyCount: Object.keys(props).length,
      statusKey: statusKey || null,
      statusType: statusType || null,
      taskKey: todoKeys.taskKey || null,
      dueKey: todoKeys.dueKey || null,
      notesKey: todoKeys.notesKey || null,
      priorityKey: todoKeys.priorityKey || null,
      stageKey: todoKeys.stageKey || null,
      addedDateKey: todoKeys.addedDateKey || null,
    });

    if (!statusProp) {
      throw makeError(
        "Colonne Status introuvable dans la base Todo.",
        "NOTION_TODO_STATUS_MISSING",
        undefined,
        {
          resolvedStatusKey: statusKey || null,
          availableProperties: Object.keys(props),
        }
      );
    }
    const doneLabel = resolveTodoDoneName(statusProp, "Done");

    step = "build_filter";
    let filter = null;
    if (statusProp.type === "status") {
      filter = { property: statusKey, status: { does_not_equal: doneLabel } };
    } else if (statusProp.type === "select") {
      filter = { property: statusKey, select: { does_not_equal: doneLabel } };
    } else {
      throw makeError("Type de colonne Status non supporte.", "NOTION_TODO_STATUS_TYPE_UNSUPPORTED", undefined, {
        resolvedStatusKey: statusKey || null,
        statusType: statusType || null,
        propertyTypes: summarizePropertyTypes(props),
      });
    }

    step = "query_rows";
    const rows = await listDbRows(token, normalizedDbId, filter);

    step = "map_rows";
    const mapped = rows.map((row) => mapTodoPage(row, todoKeys));
    const statusCounts = {};
    mapped.forEach((item) => {
      const key = normalizeText(item?.status || "") || "(empty)";
      statusCounts[key] = (statusCounts[key] || 0) + 1;
    });

    const debug = {
      dbId: maskId(normalizedDbId),
      statusKey: statusKey || null,
      statusType: statusType || null,
      doneLabel: doneLabel || null,
      rows: rows.length,
      items: mapped.length,
      statusCounts,
    };
    logTodoDebug("info", "list:success", debug);

    return { ok: true, items: mapped, debug };
  } catch (err) {
    mergeErrorMeta(err, {
      step,
      dbId: maskId(normalizedDbId),
      statusKey: statusKey || null,
      statusType: statusType || null,
    });
    logTodoDebug("error", "list:failed", {
      step,
      dbId: maskId(normalizedDbId),
      statusKey: statusKey || null,
      statusType: statusType || null,
      code: err?.code || null,
      message: String(err?.message || err || "Erreur inconnue"),
    });
    throw err;
  }
}

async function getNotionTodoById(payload) {
  const { notionToken: token, notionTodoDbId: dbId } = await chrome.storage.sync.get([
    "notionToken",
    "notionTodoDbId",
  ]);
  if (!token || !dbId) {
    throw makeError("Config Todo Notion manquante (Options).", "NOTION_TODO_CONFIG_MISSING");
  }
  const normalizedDbId = normalizeDbId(dbId);
  if (!normalizedDbId) {
    throw new Error("Invalid Todo database ID. Please paste the database URL or ID in Options.");
  }

  const pageId = normalizeText(payload?.id || payload?.todoId || "");
  if (!pageId) throw new Error("Todo ID manquant.");

  const [db, page] = await Promise.all([
    notionFetch(token, `databases/${normalizedDbId}`, "GET"),
    notionFetch(token, `pages/${pageId}`, "GET"),
  ]);
  const props = db.properties || {};
  const todoKeys = resolveTodoDbKeys(props);
  const item = mapTodoPage(page, todoKeys);
  if (!item.id) throw new Error("Todo introuvable.");
  return { ok: true, item };
}

async function createNotionTodo(payload) {
  const { notionToken: token, notionTodoDbId: dbId } = await chrome.storage.sync.get([
    "notionToken",
    "notionTodoDbId",
  ]);
  if (!token || !dbId) {
    throw makeError("Config Todo Notion manquante (Options).", "NOTION_TODO_CONFIG_MISSING");
  }
  const normalizedDbId = normalizeDbId(dbId);
  if (!normalizedDbId) {
    throw new Error("Invalid Todo database ID. Please paste the database URL or ID in Options.");
  }

  const task = normalizeText(payload?.task || "");
  if (!task) throw new Error("Task obligatoire.");
  const status = normalizeText(payload?.status || "Not Started");
  const dueDate = normalizeText(payload?.dueDate || "");
  const notes = normalizeText(payload?.notes || "");
  const priority = normalizeText(payload?.priority || "");
  const stageIds = normalizeRelationIds(payload?.stageIds, payload?.stageId || payload?.linkedStageId || "");
  const stageLabel = normalizeText(payload?.stageLabel || payload?.stage || "");
  const stageLink = normalizeText(payload?.stageLink || payload?.stageUrl || "");

  const db = await notionFetch(token, `databases/${normalizedDbId}`, "GET");
  const props = db.properties || {};
  const { statusKey, taskKey, dueKey, notesKey, priorityKey, stageKey } = resolveTodoDbKeys(props);
  const statusProp = props?.[statusKey];
  const taskProp = props?.[taskKey];
  const dueProp = props?.[dueKey];
  const notesProp = props?.[notesKey];
  const priorityProp = props?.[priorityKey];
  const stageProp = props?.[stageKey];

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

  if (priority && priorityKey) {
    const priorityName = resolveTodoStatusName(priorityProp, priority, ["High", "Medium", "Low"]);
    const priorityProperty = buildTodoPriorityProperty(priorityProp, priorityName || priority);
    if (priorityProperty) {
      properties[priorityKey] = priorityProperty;
    }
  }

  if ((stageIds.length || stageLabel || stageLink) && stageKey) {
    const stageProperty = buildTodoStageProperty(stageProp, stageIds, stageLabel, stageLink);
    if (stageProperty) {
      properties[stageKey] = stageProperty;
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
  if (!token || !dbId) {
    throw makeError("Config Todo Notion manquante (Options).", "NOTION_TODO_CONFIG_MISSING");
  }
  const pageId = payload?.id;
  if (!pageId) throw new Error("Todo ID manquant.");

  const normalizedDbId = normalizeDbId(dbId);
  if (!normalizedDbId) {
    throw new Error("Invalid Todo database ID. Please paste the database URL or ID in Options.");
  }

  const db = await notionFetch(token, `databases/${normalizedDbId}`, "GET");
  const props = db.properties || {};
  const todoKeys = resolveTodoDbKeys(props);
  const { statusKey } = todoKeys;
  const statusProp = props?.[statusKey];
  if (!statusProp || !statusKey) {
    throw new Error("Colonne Status introuvable dans la base Todo.");
  }

  let stageId = normalizeText(payload?.stageId || payload?.linkedStageId || "");
  let todoTask = normalizeText(payload?.task || payload?.todoTask || "");
  let stageLabel = normalizeText(payload?.stageLabel || payload?.stage || "");
  let stageLink = normalizeText(payload?.stageLink || payload?.stageUrl || "");
  if (!stageId || !todoTask) {
    const page = await notionFetch(token, `pages/${pageId}`, "GET");
    const mapped = mapTodoPage(page, todoKeys);
    stageId = stageId || normalizeText(mapped.stageId || "");
    todoTask = todoTask || normalizeText(mapped.task || "");
    stageLabel = stageLabel || normalizeText(mapped.stageLabel || "");
    stageLink = stageLink || normalizeText(mapped.stageLink || "");
  }
  if (!stageId) {
    stageId = await resolveStageIdFromTodoContext({
      stageLabel,
      stageLink,
      task: todoTask,
    });
  }

  const doneLabel = resolveTodoDoneName(statusProp, "Done");
  const requestedStatus = normalizeText(payload?.status || "");
  const statusName = requestedStatus
    ? resolveTodoStatusName(statusProp, requestedStatus)
    : doneLabel;
  const properties = {
    [statusKey]: buildTodoStatusProperty(statusProp, statusName),
  };

  await notionFetch(token, `pages/${pageId}`, "PATCH", { properties });

  let stageSync = null;
  const shouldSyncStage =
    !payload?.skipLinkedStageSync &&
    stageId &&
    isOaTodoTask(todoTask) &&
    normalizeText(statusName).toLowerCase() === normalizeText(doneLabel).toLowerCase();
  if (shouldSyncStage) {
    try {
      stageSync = await updateStageStatus({
        id: stageId,
        status: "OA done",
        skipLinkedTodoDone: true,
      });
    } catch (stageErr) {
      stageSync = {
        ok: false,
        error: String(stageErr?.message || stageErr || "inconnue"),
      };
    }
  }

  return { ok: true, stageSync };
}

async function isGoogleConnected() {
  try {
    const token = await getAuthToken(false);
    await verifyGoogleToken(token);
    return true;
  } catch (err) {
    const code = err?.code || classifyError(err?.message, err?.status);
    if (code === "AUTH_REQUIRED") {
      await clearCachedGoogleTokens();
    }
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

  if (msg?.type === "GET_STAGE_STATUS_OPTIONS") {
    return respondWith(
      getStageStatusOptions(),
      sendResponse,
      "Notion - stage status options",
      {
        syncName: "notionStageSchema",
      }
    );
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

  if (msg?.type === "UPDATE_STAGE_FIELDS") {
    return respondWith(
      updateStageFields(msg?.payload),
      sendResponse,
      "Notion - stage edition",
      {
        syncName: "notionStageEdit",
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

  if (msg?.type === "ENQUEUE_REJECTED_STAGE") {
    return respondWith(
      enqueueRejectedStage(msg?.payload),
      sendResponse,
      "Queue - stage refuse",
      {
        syncName: "rejectedStageQueue",
        meta: { id: msg?.payload?.id || msg?.payload?.stageId || null },
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
    return respondWith(
      (async () => {
        const { id, when, title, link } = msg?.payload || {};
        if (!id || !when) {
          throw new Error("Parametres manquants.");
        }
        const whenMs = new Date(when).getTime();
        if (!Number.isFinite(whenMs)) {
          throw new Error("Date invalide.");
        }
        const alarmName = `${INTERVIEW_ALARM_PREFIX}${id}`;
        chrome.alarms.create(alarmName, { when: whenMs });
        await setLocalWithQuotaGuard({
          [alarmName]: buildStoredNotificationPayload(
            {
              summary: title || "Entretien",
              title: title || "Entretien",
              link: link || "",
              when,
            },
            "interview"
          ),
        });
        return { ok: true };
      })(),
      sendResponse,
      "Rappel entretien - planification",
      { meta: { id: msg?.payload?.id || null } }
    );
  }

  if (msg?.type === "CLEAR_INTERVIEW_REMINDER") {
    return respondWith(
      (async () => {
        const { id } = msg?.payload || {};
        if (!id) {
          throw new Error("Parametres manquants.");
        }
        const alarmName = `${INTERVIEW_ALARM_PREFIX}${id}`;
        await new Promise((resolve, reject) => {
          try {
            chrome.alarms.clear(alarmName, () => {
              const err = chrome.runtime?.lastError;
              if (err) {
                reject(new Error(err.message || "Impossible de supprimer l'alarme."));
                return;
              }
              resolve();
            });
          } catch (err) {
            reject(err);
          }
        });
        await chrome.storage.local.remove([alarmName]);
        return { ok: true };
      })(),
      sendResponse,
      "Rappel entretien - suppression",
      { meta: { id: msg?.payload?.id || null } }
    );
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
      meta: { operation: "LIST_TODO_NOTION" },
      successDetails: (r) => ({
        items: Array.isArray(r?.items) ? r.items.length : 0,
        dbId: r?.debug?.dbId || null,
        statusKey: r?.debug?.statusKey || null,
        statusType: r?.debug?.statusType || null,
        doneLabel: r?.debug?.doneLabel || null,
      }),
    });
  }

  if (msg?.type === "GET_TODO_NOTION_BY_ID") {
    return respondWith(getNotionTodoById(msg?.payload), sendResponse, "Notion - todo detail", {
      syncName: "notionTodoDetail",
      meta: { id: msg?.payload?.id || msg?.payload?.todoId || null },
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

  if (msg?.type === "GET_URL_BLOCKER_STATE" || msg?.type === "GET_STATE") {
    return respondWith(
      getUrlBlockerState().then((state) => ({ ok: true, state })),
      sendResponse,
      "URL Blocker - get state"
    );
  }

  if (msg?.type === "SET_URL_BLOCKER_STATE" || msg?.type === "SET_STATE") {
    const payload =
      msg?.type === "SET_STATE"
        ? { enabled: msg?.enabled, rawRules: msg?.rawRules }
        : msg?.payload || {};
    return respondWith(
      setUrlBlockerState(payload).then((state) => ({ ok: true, state })),
      sendResponse,
      "URL Blocker - set state"
    );
  }

  if (msg?.type === "GET_URL_BLOCKER_LOGS" || msg?.type === "GET_LOGS") {
    return respondWith(
      getUrlBlockerLogs().then((logs) => ({ ok: true, logs })),
      sendResponse,
      "URL Blocker - get logs"
    );
  }

  if (msg?.type === "CLEAR_URL_BLOCKER_LOGS" || msg?.type === "CLEAR_LOGS") {
    return respondWith(
      clearUrlBlockerLogs().then(() => ({ ok: true })),
      sendResponse,
      "URL Blocker - clear logs"
    );
  }

  if (msg?.type === "URL_BLOCKER_RECHECK") {
    return respondWith(
      applyUrlBlockerRules().then(() => checkAllTabsForBlocker()).then(() => ({ ok: true })),
      sendResponse,
      "URL Blocker - recheck"
    );
  }

  if (msg?.type === "FOCUS_GET_STATE") {
    return respondWith(
      readFocusState().then((state) => ({ ok: true, state })),
      sendResponse,
      "Focus - get state"
    );
  }

  if (msg?.type === "FOCUS_REFRESH") {
    return respondWith(refreshFocusBridge().then((result) => ({ ok: true, ...result })), sendResponse, "Focus - refresh");
  }

  if (
    msg?.type === "FOCUS_START" ||
    msg?.type === "FOCUS_PAUSE" ||
    msg?.type === "FOCUS_RESUME" ||
    msg?.type === "FOCUS_TOGGLE_PAUSE" ||
    msg?.type === "FOCUS_STOP"
  ) {
    const endpoint =
      msg.type === "FOCUS_START"
        ? "/focus/start"
        : msg.type === "FOCUS_PAUSE"
          ? "/focus/pause"
          : msg.type === "FOCUS_RESUME"
            ? "/focus/resume"
            : msg.type === "FOCUS_TOGGLE_PAUSE"
              ? "/focus/toggle-pause"
              : "/focus/stop";
    return respondWith(
      (async () => {
        const res = await fetch(`${FOCUS_API_BASE}${endpoint}`, { method: "POST" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const focusEnabled = msg.type !== "FOCUS_STOP";
        await chrome.storage.local.set({
          [FOCUS_MODE_ENABLED_KEY]: focusEnabled,
          [URL_BLOCKER_ENABLED_KEY]: focusEnabled,
        });
        const result = await refreshFocusBridge();
        await applyUrlBlockerRules();
        return { ok: true, ...result };
      })(),
      sendResponse,
      `Focus - ${msg.type}`
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
    return respondWith(
      (async () => {
        try {
          await getAuthToken(false);
          return { ok: true, connected: true };
        } catch (_) {
          return { ok: true, connected: false };
        }
      })(),
      sendResponse,
      "Google Calendar - statut connexion"
    );
  }

  if (msg?.type === "GCAL_LOGOUT") {
    return respondWith(
      (async () => {
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
        return { ok: true };
      })(),
      sendResponse,
      "Google Calendar - deconnexion",
      { syncName: "googleAuth" }
    );
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
    return respondWith(
      (async () => {
        const data = await chrome.storage.local.get([NOTION_SYNC_KEY]);
        return { ok: true, enabled: !!data[NOTION_SYNC_KEY] };
      })(),
      sendResponse,
      "Sync Notion - statut"
    );
  }

  if (msg?.type === "NOTION_SYNC_SET") {
    return respondWith(
      (async () => {
        const enabled = !!msg.payload?.enabled;
        await chrome.storage.local.set({ [NOTION_SYNC_KEY]: enabled });
        return { ok: true };
      })(),
      sendResponse,
      "Sync Notion - mise a jour"
    );
  }

  if (msg?.type === "DEADLINE_GET_PREFS") {
    return respondWith(
      (async () => {
        const data = await chrome.storage.local.get([DEADLINE_PREFS_KEY]);
        return { ok: true, prefs: data[DEADLINE_PREFS_KEY] };
      })(),
      sendResponse,
      "Deadlines - preferences"
    );
  }

  if (msg?.type === "DEADLINE_SET_PREFS") {
    return respondWith(
      (async () => {
        const prefs = msg.payload || {};
        await chrome.storage.local.set({ [DEADLINE_PREFS_KEY]: prefs });
        return { ok: true };
      })(),
      sendResponse,
      "Deadlines - sauvegarde preferences"
    );
  }

  if (msg?.type === "OFFLINE_QUEUE_STATUS") {
    return respondWith(
      (async () => {
        const data = await chrome.storage.local.get([OFFLINE_QUEUE_KEY]);
        const items = Array.isArray(data[OFFLINE_QUEUE_KEY]) ? data[OFFLINE_QUEUE_KEY] : [];
        return { ok: true, count: items.length };
      })(),
      sendResponse,
      "Queue hors ligne - statut"
    );
  }

  if (msg?.type === "OFFLINE_QUEUE_DETAILS") {
    return respondWith(
      (async () => {
        const data = await chrome.storage.local.get([OFFLINE_QUEUE_KEY]);
        const now = Date.now();
        const rawItems = Array.isArray(data[OFFLINE_QUEUE_KEY]) ? data[OFFLINE_QUEUE_KEY] : [];
        const items = rawItems
          .map((entry) => normalizeQueuedNotionItem(entry))
          .filter(Boolean)
          .map((entry, index) => {
            const payload = entry.payload || {};
            const company = normalizeText(payload.company || "");
            const title = normalizeText(payload.title || "");
            const fallback = normalizeText(payload.url || "");
            const label = [company, title].filter(Boolean).join(" - ") || fallback || "Stage";
            const waitMs = entry.nextAttemptAt ? Math.max(0, entry.nextAttemptAt - now) : 0;
            const state =
              waitMs > 0
                ? "retry_wait"
                : index === 0 && !!notionQueueWorkerInFlight
                  ? "uploading"
                  : "queued";

            return {
              id: entry.id,
              label,
              company,
              title,
              attempts: entry.attempts || 0,
              waitMs,
              state,
              nextAttemptAt: entry.nextAttemptAt || 0,
              lastError: entry.lastError || "",
            };
          });

        return {
          ok: true,
          count: items.length,
          processing: !!notionQueueWorkerInFlight,
          items,
        };
      })(),
      sendResponse,
      "Queue hors ligne - details"
    );
  }

  if (msg?.type === "GCAL_GET_NOTIFY_PREFS") {
    return respondWith(
      (async () => {
        const data = await chrome.storage.local.get([GCAL_NOTIFY_TOGGLE_KEY]);
        return { ok: true, ids: data[GCAL_NOTIFY_TOGGLE_KEY] || [] };
      })(),
      sendResponse,
      "Google Calendar - preferences notifications"
    );
  }

  if (msg?.type === "GCAL_SET_NOTIFY_PREFS") {
    return respondWith(
      (async () => {
        const ids = Array.isArray(msg.payload?.ids) ? msg.payload.ids : [];
        await chrome.storage.local.set({ [GCAL_NOTIFY_TOGGLE_KEY]: ids });
        return { ok: true };
      })(),
      sendResponse,
      "Google Calendar - sauvegarde notifications"
    );
  }

  if (msg?.type === "GCAL_GET_REMINDER_PREFS") {
    return respondWith(
      (async () => {
        const data = await chrome.storage.local.get([GCAL_REMINDER_PREFS_KEY]);
        const prefs = normalizeReminderPrefs(data?.[GCAL_REMINDER_PREFS_KEY]);
        return { ok: true, prefs };
      })(),
      sendResponse,
      "Google Calendar - preferences rappels"
    );
  }

  if (msg?.type === "GCAL_SET_REMINDER_PREFS") {
    return respondWith(
      (async () => {
        const prefs = normalizeReminderPrefs(msg?.payload?.prefs);
        await chrome.storage.local.set({ [GCAL_REMINDER_PREFS_KEY]: prefs });
        return { ok: true, prefs };
      })(),
      sendResponse,
      "Google Calendar - sauvegarde rappels"
    );
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
    return respondWith(
      (async () => {
        const prefs = msg.payload || {};
        await chrome.storage.local.set({ yahooNewsPrefs: prefs });
        return { ok: true };
      })(),
      sendResponse,
      "Yahoo Prefs - sauvegarde"
    );
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
  return false;
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
  await setLocalWithQuotaGuard({
    [alarmName]: buildStoredNotificationPayload(
      {
        ...source,
        snoozeMinutes: minutes,
        sourceNotificationId: notificationId,
      },
      "gcal-snooze"
    ),
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
  await setLocalWithQuotaGuard({
    [alarmName]: buildStoredNotificationPayload(data, "gcal-snooze"),
  });
  chrome.alarms.create(alarmName, { when });
  return { ok: true };
}

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (!alarm?.name) return;
  if (alarm.name === FOCUS_SYNC_ALARM) {
    try {
      await refreshFocusBridge();
    } catch (_) {
      // ignore
    }
    return;
  }
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
  if (alarm.name === NOTION_QUEUE_ALARM) {
    try {
      await processNotionQueue();
    } catch (err) {
      await handleError(err, "Alarme Queue Notion", null, { syncName: "offlineQueue" });
    }
    return;
  }
  if (alarm.name.startsWith(GCAL_SNOOZE_ALARM_PREFIX)) {
    chrome.storage.local.get([alarm.name], (data) => {
      const info = data[alarm.name];
      if (!info) return;
      void setLocalWithQuotaGuard({
        [alarm.name]: buildStoredNotificationPayload(
          { ...info, notifiedAt: Date.now() },
          "gcal-snooze"
        ),
      }).catch(() => {});
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
      void setLocalWithQuotaGuard({
        [alarm.name]: buildStoredNotificationPayload(
          { ...info, notifiedAt: Date.now() },
          "deadline"
        ),
      }).catch(() => {});
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
    const stageId = normalizeText(alarm.name.slice(INTERVIEW_ALARM_PREFIX.length) || "");
    const data = await chrome.storage.local.get([alarm.name]);
    const info = data?.[alarm.name] || {};
    await setLocalWithQuotaGuard({
      [alarm.name]: buildStoredNotificationPayload(
        { ...info, notifiedAt: Date.now(), title: info.title || info.summary || "Entretien" },
        "interview"
      ),
    }).catch(() => {});
    const message = info.when
      ? `Rappel entretien: ${new Date(info.when).toLocaleString()}`
      : "Rappel entretien";
    chrome.notifications.create(alarm.name, {
      type: "basic",
      iconUrl: "icons/icon-128.png",
      title: info.title || info.summary || "Entretien",
      message,
      priority: 2,
    });

    if (stageId) {
      try {
        const stageContext = await buildStageSyncContext(stageId, info);
        await markLinkedStageInterviewTodosDone(stageId, stageContext);
        await updateStageStatus({
          id: stageId,
          status: "Entretien finished",
          skipLinkedTodoDone: true,
        });
      } catch (err) {
        await handleError(err, "Post-entretien auto-finish", { stageId }, {
          syncName: "notionStageStatus",
        });
      }
    }
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
  const map = pruneGcalEventMap(gcalEventMap);
  const data = map?.[alarm.name];
  if (!data) return;

  const notified = pruneGcalNotifiedState(gcalNotified);
  const key = alarm.name;
  if (notified[key]) return;

  const now = Date.now();
  const startMs = data.start ? new Date(data.start).getTime() : null;
  if (!startMs || now > startMs + GCAL_NOTIFY_WINDOW_MIN * 60 * 1000) {
    return;
  }

  createGcalNotification(alarm.name, data);

  notified[key] = Date.now();
  delete map[key];
  await setLocalWithQuotaGuard(
    {
      gcalEventMap: pruneGcalEventMap(map),
      [GCAL_NOTIFIED_KEY]: pruneGcalNotifiedState(notified),
      [alarm.name]: buildStoredNotificationPayload(
        { ...data, notifiedAt: Date.now() },
        "gcal"
      ),
    },
    {
      retryPayload: () => ({
        gcalEventMap: pruneGcalEventMap(map, { aggressive: true }),
        [GCAL_NOTIFIED_KEY]: pruneGcalNotifiedState(notified, { aggressive: true }),
        [alarm.name]: buildStoredNotificationPayload(
          { ...data, notifiedAt: Date.now() },
          "gcal"
        ),
      }),
    }
  );
});

async function flushOfflineQueue() {
  await processNotionQueue();
}

if (chrome.declarativeNetRequest.onRuleMatchedDebug) {
  chrome.declarativeNetRequest.onRuleMatchedDebug.addListener((info) => {
    queueUrlBlockerLog({
      ts: Date.now(),
      url: info?.request?.url || "",
      type: info?.request?.type || "unknown",
      action: "blocked",
      source: "dnr-debug",
      ruleId: info?.rule?.ruleId || info?.ruleId || 0,
    });
  });
}

chrome.runtime.onInstalled.addListener(() => {
  seedDefaultConfig().catch(() => {});
  runStorageMaintenance({ aggressive: true }).catch(() => {});
  chrome.alarms.create(GCAL_SYNC_ALARM, { periodInMinutes: 15 });
  chrome.alarms.create(YAHOO_NEWS_ALARM, { periodInMinutes: 15 });
  chrome.alarms.create(NOTION_SYNC_ALARM, { periodInMinutes: 60 });
  chrome.alarms.create(NOTION_QUEUE_ALARM, { periodInMinutes: 1 });
  chrome.alarms.create(STAGE_DATA_SYNC_ALARM, { periodInMinutes: 2 });
  chrome.alarms.create(STAGE_SLA_ALARM, { periodInMinutes: 720 });
  flushOfflineQueue().catch(() => {});
  scheduleStageSnapshotRefresh(3000);
  ensureUrlBlockerDefaults().then(() => applyUrlBlockerRules()).then(checkAllTabsForBlocker);
  bootstrapFocusBridge();
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
      void removeNotificationStorage(notificationId).catch(() => {});
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
      void removeNotificationStorage(notificationId).catch(() => {});
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
      void removeNotificationStorage(notificationId).catch(() => {});
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
    void removeNotificationStorage(notificationId).catch(() => {});
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
      void removeNotificationStorage(notificationId).catch(() => {});
    });
    chrome.notifications.clear(notificationId);
    return;
  }
  chrome.notifications.clear(notificationId);
  void removeNotificationStorage(notificationId).catch(() => {});
});

chrome.notifications.onClosed.addListener((notificationId) => {
  if (!notificationId || !isAlarmBackedStorageKey(notificationId)) return;
  void removeNotificationStorage(notificationId).catch(() => {});
});

chrome.runtime.onStartup.addListener(() => {
  seedDefaultConfig().catch(() => {});
  runStorageMaintenance({ aggressive: true }).catch(() => {});
  chrome.alarms.create(GCAL_SYNC_ALARM, { periodInMinutes: 15 });
  chrome.alarms.create(YAHOO_NEWS_ALARM, { periodInMinutes: 15 });
  chrome.alarms.create(NOTION_SYNC_ALARM, { periodInMinutes: 60 });
  chrome.alarms.create(NOTION_QUEUE_ALARM, { periodInMinutes: 1 });
  chrome.alarms.create(STAGE_DATA_SYNC_ALARM, { periodInMinutes: 2 });
  chrome.alarms.create(STAGE_SLA_ALARM, { periodInMinutes: 720 });
  flushOfflineQueue().catch(() => {});
  scheduleStageSnapshotRefresh(3000);
  ensureUrlBlockerDefaults().then(() => applyUrlBlockerRules()).then(checkAllTabsForBlocker);
  bootstrapFocusBridge();
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return;
  if (
    changes[URL_BLOCKER_RULES_KEY] ||
    changes[URL_BLOCKER_ENABLED_KEY] ||
    changes[FOCUS_MODE_ENABLED_KEY] ||
    changes[FOCUS_STATE_KEY]
  ) {
    applyUrlBlockerRules().then(checkAllTabsForBlocker);
  }
  if (changes[FOCUS_STATE_KEY] || changes[FOCUS_MODE_ENABLED_KEY]) {
    readFocusState()
      .then((state) => syncFocusBlockingRules(state))
      .then(checkAllTabsForBlocker)
      .catch(() => {});
  }
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  const candidateUrl = changeInfo.url || tab?.url || "";
  if (!candidateUrl) return;
  if (changeInfo.url) {
    chrome.storage.local
      .get([
        URL_BLOCKER_RULES_KEY,
        URL_BLOCKER_ENABLED_KEY,
        FOCUS_STATE_KEY,
        FOCUS_MODE_ENABLED_KEY,
      ])
      .then((data) => {
        const localFilters =
          data[URL_BLOCKER_ENABLED_KEY] === false ||
          !shouldApplyFocusBlocking(data[FOCUS_STATE_KEY], data[FOCUS_MODE_ENABLED_KEY])
            ? []
            : normalizeUrlBlockerRules(data[URL_BLOCKER_RULES_KEY] || []);
        const focusFilters = shouldApplyFocusBlocking(data[FOCUS_STATE_KEY], data[FOCUS_MODE_ENABLED_KEY])
          ? getFocusUrlFilters(data[FOCUS_STATE_KEY])
          : [];
        const filters = [...localFilters, ...focusFilters];
        if (!filters.length) return;
        if (shouldBlockUrl(candidateUrl, filters)) {
          queueUrlBlockerLog({
            ts: Date.now(),
            url: candidateUrl,
            type: "tab",
            action: "closed",
            source: "tab-updated",
          });
          chrome.tabs.remove(tabId).catch(() => {});
        }
      })
      .catch(() => {});
  }
  // Pipeline auto-import removed.
});

bootstrapFocusBridge();
