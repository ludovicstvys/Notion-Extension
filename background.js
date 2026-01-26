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
const YAHOO_QUOTE_URL = "https://query1.finance.yahoo.com/v7/finance/quote";
const YAHOO_QUOTE_CACHE_MIN = 5;

async function notionFetch(token, path, method, body) {
  const res = await fetch(`https://api.notion.com/v1/${path}`,
    {
      method,
      headers: {
        "Authorization": `Bearer ${token}`,
        "Notion-Version": NOTION_VERSION,
        "Content-Type": "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
    }
  );

  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const baseMsg = json?.message || `HTTP ${res.status}`;
    if (res.status === 404 && path.startsWith("databases/")) {
      throw new Error(`${baseMsg} (check the database ID and sharing settings)`);
    }
    throw new Error(baseMsg);
  }
  return json;
}

function todayISODate() {
  return new Date().toISOString().slice(0, 10);
}

function normalizeText(input) {
  const text = (input ?? "").toString();
  return text.normalize("NFC").trim();
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
  let res = await fetch(`${GCAL_BASE}/${path}`, {
    method: options.method || "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  if (res.status === 401 || res.status === 403) {
    await new Promise((resolve) =>
      chrome.identity.removeCachedAuthToken({ token }, resolve)
    );
    if (!interactive) {
      throw new Error("AUTH_REQUIRED");
    }
    token = await getAuthToken(true);
    res = await fetch(`${GCAL_BASE}/${path}`, {
      method: options.method || "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
    });
  }
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = json?.error?.message || `HTTP ${res.status}`;
    throw new Error(msg);
  }
  return json;
}

async function gcalFetch(path, interactive) {
  return gcalRequest(path, interactive);
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
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Yahoo News HTTP ${res.status}`);
  const xml = await res.text();
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
  return payload;
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
  const url = `${YAHOO_QUOTE_URL}?symbols=${encodeURIComponent(list.join(","))}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Yahoo Quotes HTTP ${res.status}`);
  const json = await res.json().catch(() => ({}));
  const items = json?.quoteResponse?.result || [];
  const bySymbol = {};
  items.forEach((q) => {
    if (!q?.symbol) return;
    bySymbol[q.symbol] = {
      symbol: q.symbol,
      price: q.regularMarketPrice,
      change: q.regularMarketChange,
      changePct: q.regularMarketChangePercent,
      currency: q.currency,
      updatedAt: Date.now(),
    };
  });
  const payload = { fetchedAt: Date.now(), bySymbol };
  await chrome.storage.local.set({ yahooQuotes: payload });
  return payload;
}

async function getYahooQuotes(symbols, force) {
  const { yahooQuotes } = await chrome.storage.local.get(["yahooQuotes"]);
  const isFresh =
    yahooQuotes?.fetchedAt &&
    Date.now() - yahooQuotes.fetchedAt < YAHOO_QUOTE_CACHE_MIN * 60 * 1000;
  if (!force && isFresh && yahooQuotes?.bySymbol) return yahooQuotes;
  return fetchYahooQuotes(symbols);
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

async function syncNotionToCalendar() {
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

  if (!token || !dbId) throw new Error("Config Notion manquante (Options).");
  const normalizedDbId = normalizeDbId(dbId);
  if (!normalizedDbId) {
    throw new Error("Invalid database ID. Please paste the database URL or ID in Options.");
  }

  const rows = await listDbRows(token, normalizedDbId);
  const { [NOTION_SYNC_MAP]: storedMap } = await chrome.storage.local.get([NOTION_SYNC_MAP]);
  const syncMap = storedMap || {};

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
  }

  await chrome.storage.local.set({ [NOTION_SYNC_MAP]: syncMap });
  return { ok: true };
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
  const tagRules = await getTagRules();
  const cacheKey = JSON.stringify({ timeMin, timeMax, calendarIds });
  const { gcalEventCache } = await chrome.storage.local.get([GCAL_CACHE_KEY]);
  const cache = gcalEventCache || {};
  const cached = cache[cacheKey];
  if (cached && Date.now() - cached.fetchedAt < GCAL_CACHE_TTL_MS) {
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
        meetingLink: extractMeetingLink(ev),
        tags: tagItem(
          `${ev.summary || ""} ${ev.location || ""} ${ev.description || ""} ${ev.htmlLink || ""}`,
          tagRules
        ),
      });
    }
  }

  const sorted = flat.sort((a, b) => new Date(a.start) - new Date(b.start));
  cache[cacheKey] = { fetchedAt: Date.now(), events: sorted };
  await chrome.storage.local.set({ [GCAL_CACHE_KEY]: cache });
  return sorted;
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

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === "UPSERT_NOTION") {
    upsertToNotion(msg.payload)
      .then((r) => sendResponse(r))
      .catch((e) => sendResponse({ ok: false, error: e.message }));
    return true;
  }

  if (msg?.type === "CHECK_NOTION_DB") {
    checkDbAndLoad()
      .then((r) => sendResponse(r))
      .catch((e) => sendResponse({ ok: false, error: e.message }));
    return true;
  }

  if (msg?.type === "GET_OPEN_STAGES") {
    listOpenStages()
      .then((r) => sendResponse(r))
      .catch((e) => sendResponse({ ok: false, error: e.message }));
    return true;
  }

  if (msg?.type === "GET_TODO_STAGES") {
    listTodoStages()
      .then((r) => sendResponse(r))
      .catch((e) => sendResponse({ ok: false, error: e.message }));
    return true;
  }

  if (msg?.type === "GCAL_LIST_CALENDARS") {
    listCalendars(false)
      .then((items) => sendResponse({ ok: true, items }))
      .catch((e) => sendResponse({ ok: false, error: e.message }));
    return true;
  }

  if (msg?.type === "GCAL_LOAD_EVENTS") {
    const { timeMin, timeMax, calendarIds } = msg.payload || {};
    loadEventsRange(timeMin, timeMax, calendarIds, false)
      .then((events) => sendResponse({ ok: true, events }))
      .catch((e) => sendResponse({ ok: false, error: e.message }));
    return true;
  }

  if (msg?.type === "GCAL_CONNECT") {
    getAuthToken(true)
      .then(() => sendResponse({ ok: true }))
      .catch((e) => sendResponse({ ok: false, error: e.message }));
    return true;
  }

  if (msg?.type === "GCAL_AUTH_STATUS") {
    getAuthToken(false)
      .then(() => sendResponse({ ok: true, connected: true }))
      .catch(() => sendResponse({ ok: true, connected: false }));
    return true;
  }

  if (msg?.type === "GCAL_LOGOUT") {
    getAuthToken(false)
      .then(
        (token) =>
          new Promise((resolve) =>
            chrome.identity.removeCachedAuthToken({ token }, resolve)
          )
      )
      .then(() => sendResponse({ ok: true }))
      .catch(() => sendResponse({ ok: true }));
    return true;
  }

  if (msg?.type === "GCAL_CREATE_EVENT") {
    const { calendarId, event } = msg.payload || {};
    if (!calendarId || !event) {
      sendResponse({ ok: false, error: "Missing calendarId or event." });
      return true;
    }
    createCalendarEvent(calendarId, event)
      .then((created) => sendResponse({ ok: true, event: created }))
      .catch((e) => sendResponse({ ok: false, error: e.message }));
    return true;
  }

  if (msg?.type === "NOTION_SYNC_NOW") {
    syncNotionToCalendar()
      .then((r) => sendResponse(r))
      .catch((e) => sendResponse({ ok: false, error: e.message }));
    return true;
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
    getYahooNews(false)
      .then((data) => sendResponse({ ok: true, data }))
      .catch((e) => sendResponse({ ok: false, error: e.message }));
    return true;
  }

  if (msg?.type === "REFRESH_YAHOO_NEWS") {
    getYahooNews(true)
      .then((data) => sendResponse({ ok: true, data }))
      .catch((e) => sendResponse({ ok: false, error: e.message }));
    return true;
  }

  if (msg?.type === "GET_YAHOO_QUOTES") {
    const symbols = msg.payload?.symbols || [];
    const force = !!msg.payload?.force;
    getYahooQuotes(symbols, force)
      .then((data) => sendResponse({ ok: true, data }))
      .catch((e) => sendResponse({ ok: false, error: e.message }));
    return true;
  }

  if (msg?.type === "GET_YAHOO_PREFS") {
    getYahooPrefs()
      .then((prefs) => sendResponse({ ok: true, prefs }))
      .catch((e) => sendResponse({ ok: false, error: e.message }));
    return true;
  }

  if (msg?.type === "SET_YAHOO_PREFS") {
    const prefs = msg.payload || {};
    chrome.storage.local.set({ yahooNewsPrefs: prefs }, () => {
      sendResponse({ ok: true });
    });
    return true;
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
    } catch (_) {}
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
    } catch (_) {}
    return;
  }

  if (alarm.name === NOTION_SYNC_ALARM) {
    const { [NOTION_SYNC_KEY]: enabled } = await chrome.storage.local.get([NOTION_SYNC_KEY]);
    if (!enabled) return;
    try {
      await syncNotionToCalendar();
    } catch (_) {}
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
    } catch (_) {
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
});

chrome.runtime.onStartup.addListener(() => {
  chrome.alarms.create(GCAL_SYNC_ALARM, { periodInMinutes: 15 });
  chrome.alarms.create(YAHOO_NEWS_ALARM, { periodInMinutes: 15 });
  chrome.alarms.create(NOTION_SYNC_ALARM, { periodInMinutes: 60 });
  flushOfflineQueue();
});
