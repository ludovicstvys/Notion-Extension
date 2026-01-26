const NOTION_VERSION = "2022-06-28";
const MAX_LIST_ROWS = 200;

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

function todayLocalISODate() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
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

async function findByUrl(token, dbId, url) {
  const body = {
    filter: {
      property: "lien offre",
      url: { equals: url },
    },
  };
  const r = await notionFetch(token, `databases/${dbId}/query`, "POST", body);
  return r.results?.[0] || null;
}

function buildProps(data) {
  const props = {
    "Job Title": { rich_text: [{ text: { content: data.title || "Sans titre" } }] },
    "Entreprise": { title: [{ text: { content: data.company || "" } }] },
    "Lieu": { rich_text: [{ text: { content: data.location || "" } }] },
    "lien offre": { rich_text: [{ text: { content: data.url || "" } }] },
    "Status": { status: { name: data.applied ? "Candidature envoyée" : "Ouvert" } },
  };
  if (data.applied) {
    props["Application Date"] = { date: { start: todayISODate() } };
  }
  if (data.datePosted) {
    props["Date d'ouverture"] = {
      rich_text: [{ text: { content: String(data.datePosted) } }],
    };
  }

  if (data.startDate) {
    props["Start month"] = {
      rich_text: [{ text: { content: String(data.startDate) } }],
    };
  }
  const roleValues = String(data.role || "Off-cycle")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (roleValues.length) {
    props["Role"] = { multi_select: roleValues.map((name) => ({ name })) };
  }
if (data.type) {
    props["Type d'infrastructure"] = {
      rich_text: [{ text: { content: String(data.type) } }],
    };
  }
  if (data.deadline) {
    props["Date de fermeture"] = {
      rich_text: [{ text: { content: String(data.deadline) } }],
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

  const existing = await findByUrl(token, normalizedDbId, payload.url);
  const properties = buildProps(payload);

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

async function listDbRows(token, dbId) {
  let rows = [];
  let cursor = undefined;

  while (rows.length < MAX_LIST_ROWS) {
    const body = { page_size: 100 };
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

  if (!token || !dbId) throw new Error("Config Notion manquante (Options).");
  const normalizedDbId = normalizeDbId(dbId);
  if (!normalizedDbId) {
    throw new Error("Invalid database ID. Please paste the database URL or ID in Options.");
  }

  const db = await notionFetch(token, `databases/${normalizedDbId}`, "GET");
  const rows = await listDbRows(token, normalizedDbId);

  const mapped = rows.map((r) => {
    const p = r.properties || {};
    return {
      id: r.id,
      title: propText(p["Job Title"]) || propText(p["Name"]) || "",
      company: propText(p["Entreprise"]) || "",
      location: propText(p["Lieu"]) || "",
      url: propText(p["lien offre"]) || "",
      status: propText(p["Status"]) || "",
      role: propText(p["Role"]) || "",
      type: propText(p["Type d'infrastructure"]) || "",
      applicationDate: propText(p["Application Date"]) || "",
      startMonth: propText(p["Start month"]) || "",
      openDate: propText(p["Date d'ouverture"]) || "",
      closeDate: propText(p["Date de fermeture"]) || "",
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

  sendResponse({ ok: false, error: "Message inconnu." });
  return true;
});

const TIME_LIMITS_KEY = "timeLimitRules";
const TIME_USAGE_KEY = "timeLimitUsage";
const ACTIVE_STATE_KEY = "timeLimitActiveState";
const TICK_ALARM = "timeLimitTick";

let cachedTimeRules = [];

function normalizePattern(input) {
  return (input || "").trim().toLowerCase();
}

function isWebUrl(url) {
  return /^https?:\/\//i.test(url || "");
}

function normalizeRules(rules) {
  const items = Array.isArray(rules) ? rules : [];
  return items
    .map((rule) => {
      const patternKey = normalizePattern(rule.pattern);
      const minutes = Number(rule.minutes);
      if (!patternKey || !Number.isFinite(minutes) || minutes <= 0) return null;
      return {
        pattern: rule.pattern,
        patternKey,
        minutes,
        limitMs: minutes * 60 * 1000,
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.patternKey.length - a.patternKey.length);
}

async function loadTimeRules() {
  const { timeLimitRules } = await chrome.storage.sync.get([TIME_LIMITS_KEY]);
  cachedTimeRules = normalizeRules(timeLimitRules);
}

function matchRule(url) {
  if (!isWebUrl(url)) return null;
  const haystack = url.toLowerCase();
  for (const rule of cachedTimeRules) {
    if (haystack.includes(rule.patternKey)) return rule;
  }
  return null;
}

async function getUsage() {
  const today = todayLocalISODate();
  const { [TIME_USAGE_KEY]: stored } = await chrome.storage.local.get([TIME_USAGE_KEY]);
  if (!stored || stored.date !== today) {
    return { date: today, byPattern: {} };
  }
  return stored;
}

async function setUsage(usage) {
  await chrome.storage.local.set({ [TIME_USAGE_KEY]: usage });
}

async function addUsage(patternKey, deltaMs) {
  if (!patternKey || deltaMs <= 0) return 0;
  const usage = await getUsage();
  const current = usage.byPattern[patternKey] || 0;
  const next = current + deltaMs;
  usage.byPattern[patternKey] = next;
  await setUsage(usage);
  return next;
}

async function getUsageFor(patternKey) {
  if (!patternKey) return 0;
  const usage = await getUsage();
  return usage.byPattern[patternKey] || 0;
}

async function getActiveState() {
  const { [ACTIVE_STATE_KEY]: state } = await chrome.storage.local.get([ACTIVE_STATE_KEY]);
  return state || null;
}

async function setActiveState(state) {
  await chrome.storage.local.set({ [ACTIVE_STATE_KEY]: state });
}

async function clearActiveState() {
  await chrome.storage.local.remove([ACTIVE_STATE_KEY]);
}

async function closeTab(tabId) {
  if (!tabId) return;
  try {
    await chrome.tabs.remove(tabId);
  } catch (_) {
    // ignore
  }
}

async function getFocusedActiveTab() {
  try {
    const win = await chrome.windows.getLastFocused({ populate: false });
    if (!win || !win.focused || win.state === "minimized" || win.id === chrome.windows.WINDOW_ID_NONE) {
      return null;
    }
    const tabs = await chrome.tabs.query({ active: true, windowId: win.id });
    return tabs[0] || null;
  } catch (_) {
    return null;
  }
}

async function finalizeState(state, now) {
  if (!state || !state.patternKey || !state.lastTickAt) return;
  const delta = now - state.lastTickAt;
  if (delta > 0) await addUsage(state.patternKey, delta);
}

async function enforceLimit(tab, rule) {
  const used = await getUsageFor(rule.patternKey);
  if (used >= rule.limitMs) {
    await closeTab(tab.id);
    await clearActiveState();
    return true;
  }
  return false;
}

async function tickTimeLimits() {
  const now = Date.now();
  const tab = await getFocusedActiveTab();
  const state = await getActiveState();

  if (!tab || !isWebUrl(tab.url)) {
    if (state) {
      await finalizeState(state, now);
      await clearActiveState();
    }
    return;
  }

  const rule = matchRule(tab.url);
  if (!rule) {
    if (state) {
      await finalizeState(state, now);
      await clearActiveState();
    }
    return;
  }

  if (state && state.tabId === tab.id && state.patternKey === rule.patternKey) {
    const delta = now - (state.lastTickAt || now);
    if (delta > 0) {
      const total = await addUsage(rule.patternKey, delta);
      if (total >= rule.limitMs) {
        await closeTab(tab.id);
        await clearActiveState();
        return;
      }
    }
    await setActiveState({ ...state, url: tab.url, lastTickAt: now });
  } else {
    if (state) await finalizeState(state, now);
    await setActiveState({
      tabId: tab.id,
      url: tab.url,
      patternKey: rule.patternKey,
      lastTickAt: now,
    });
    await enforceLimit(tab, rule);
  }
}

async function checkTabBlocked(tab) {
  if (!tab || !isWebUrl(tab.url)) return;
  const rule = matchRule(tab.url);
  if (!rule) return;
  await enforceLimit(tab, rule);
}

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm?.name === TICK_ALARM) tickTimeLimits();
});

chrome.tabs.onActivated.addListener(() => {
  tickTimeLimits();
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.url || changeInfo.status === "complete") {
    checkTabBlocked(tab);
  }
});

chrome.windows.onFocusChanged.addListener(() => {
  tickTimeLimits();
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "sync" && changes[TIME_LIMITS_KEY]) {
    cachedTimeRules = normalizeRules(changes[TIME_LIMITS_KEY].newValue);
  }
});

chrome.runtime.onInstalled.addListener(() => {
  loadTimeRules();
  chrome.alarms.create(TICK_ALARM, { periodInMinutes: 1 });
});

chrome.runtime.onStartup.addListener(() => {
  loadTimeRules();
  chrome.alarms.create(TICK_ALARM, { periodInMinutes: 1 });
});

loadTimeRules();
chrome.alarms.create(TICK_ALARM, { periodInMinutes: 1 });
