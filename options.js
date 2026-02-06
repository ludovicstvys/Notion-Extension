const tokenEl = document.getElementById("token");
const dbEl = document.getElementById("db");
const statusEl = document.getElementById("status");
const checkBtn = document.getElementById("check");
const existingEl = document.getElementById("existing");
const columnsEl = document.getElementById("columns");
const bdfApiKeyEl = document.getElementById("bdf-api-key");
const googlePlacesApiKeyEl = document.getElementById("google-places-api-key");
const todoDbEl = document.getElementById("todo-db");
const todoStatusEl = document.getElementById("todo-status");
const gcalLoginBtn = document.getElementById("gcal-login");
const gcalLogoutBtn = document.getElementById("gcal-logout");
const gcalStatusEl = document.getElementById("gcal-status");
const gcalDefaultEl = document.getElementById("gcal-default");
const gcalRefreshBtn = document.getElementById("gcal-refresh");
const urlBlockerInputEl = document.getElementById("url-blocker-input");
const urlBlockerListEl = document.getElementById("url-blocker-list");
const urlBlockerSaveBtn = document.getElementById("url-blocker-save");
const urlBlockerStatusEl = document.getElementById("url-blocker-status");
const widgetEventsEl = document.getElementById("widget-events");
const widgetAddEl = document.getElementById("widget-add");
const widgetFocusEl = document.getElementById("widget-focus");
const widgetTodoEl = document.getElementById("widget-todo");
const widgetNewsEl = document.getElementById("widget-news");
const widgetMarketsEl = document.getElementById("widget-markets");
const widgetTodoNotionEl = document.getElementById("widget-todo-notion");
const widgetSaveBtn = document.getElementById("widget-save");
const widgetStatusEl = document.getElementById("widget-status");
const focusEnabledEl = document.getElementById("focus-enabled");
const pomodoroWorkEl = document.getElementById("pomodoro-work");
const pomodoroBreakEl = document.getElementById("pomodoro-break");
const focusSaveBtn = document.getElementById("focus-save");
const focusStatusEl = document.getElementById("focus-status");
const notionSyncEnabledEl = document.getElementById("notion-sync-enabled");
const notionSyncNowBtn = document.getElementById("notion-sync-now");
const notionSyncStatusEl = document.getElementById("notion-sync-status");
const mapStatusEl = document.getElementById("map-status-msg");
const mapSaveBtn = document.getElementById("map-save");
const mapRefreshBtn = document.getElementById("map-refresh");
const tagRulesEl = document.getElementById("tag-rules");
const tagAddBtn = document.getElementById("tag-add");
const tagSaveBtn = document.getElementById("tag-save");
const tagStatusEl = document.getElementById("tag-status");
const statusOpenEl = document.getElementById("status-open");
const statusAppliedEl = document.getElementById("status-applied");
const deadlineEnabledEl = document.getElementById("deadline-enabled");
const deadlineOffsetsEl = document.getElementById("deadline-offsets");
const deadlineSaveBtn = document.getElementById("deadline-save");
const deadlineStatusEl = document.getElementById("deadline-status");
const exportBtn = document.getElementById("export-config");
const importBtn = document.getElementById("import-config");
const configDataEl = document.getElementById("config-data");
const configStatusEl = document.getElementById("config-status");
const diagRunTestsBtn = document.getElementById("diag-run-tests");
const diagRefreshBtn = document.getElementById("diag-refresh");
const diagClearErrorsBtn = document.getElementById("diag-clear-errors");
const diagNotionTestEl = document.getElementById("diag-notion-test");
const diagGoogleTestEl = document.getElementById("diag-google-test");
const diagLastSyncEl = document.getElementById("diag-last-sync");
const diagOfflineQueueEl = document.getElementById("diag-offline-queue");
const diagSyncStatsEl = document.getElementById("diag-sync-stats");
const diagErrorsEl = document.getElementById("diag-errors");
const mapFields = {
  jobTitle: document.getElementById("map-job-title"),
  company: document.getElementById("map-company"),
  location: document.getElementById("map-location"),
  url: document.getElementById("map-url"),
  status: document.getElementById("map-status"),
  applicationDate: document.getElementById("map-application-date"),
  openDate: document.getElementById("map-open-date"),
  closeDate: document.getElementById("map-close-date"),
  startMonth: document.getElementById("map-start-month"),
  role: document.getElementById("map-role"),
  type: document.getElementById("map-type"),
};

const DEFAULTS = self?.EXTENSION_DEFAULTS || {};
const SYNC_DEFAULTS = DEFAULTS.sync || {};
const LOCAL_DEFAULTS = DEFAULTS.local || {};

chrome.storage.sync.get(["notionToken", "notionDbId"], (v) => {
  tokenEl.value = v.notionToken ?? SYNC_DEFAULTS.notionToken ?? "";
  dbEl.value = v.notionDbId ?? SYNC_DEFAULTS.notionDbId ?? "";
});
chrome.storage.sync.get(["notionTodoDbId"], (v) => {
  if (todoDbEl) todoDbEl.value = v.notionTodoDbId ?? SYNC_DEFAULTS.notionTodoDbId ?? "";
});
chrome.storage.local.get(["bdfApiKey"], (v) => {
  if (bdfApiKeyEl) bdfApiKeyEl.value = v.bdfApiKey ?? LOCAL_DEFAULTS.bdfApiKey ?? "";
});
chrome.storage.local.get(["googlePlacesApiKey"], (v) => {
  if (googlePlacesApiKeyEl) {
    googlePlacesApiKeyEl.value =
      v.googlePlacesApiKey ?? LOCAL_DEFAULTS.googlePlacesApiKey ?? "";
  }
});
let urlBlockerRules = [];
function renderUrlBlockerRules() {
  if (!urlBlockerListEl) return;
  urlBlockerListEl.innerHTML = "";
  urlBlockerRules.forEach((rule) => {
    const chip = document.createElement("div");
    chip.className = "chip";
    chip.textContent = rule;

    const del = document.createElement("button");
    del.type = "button";
    del.setAttribute("aria-label", `Supprimer ${rule}`);
    del.textContent = "×";
    del.addEventListener("click", () => {
      urlBlockerRules = urlBlockerRules.filter((r) => r !== rule);
      renderUrlBlockerRules();
    });

    chip.appendChild(del);
    urlBlockerListEl.appendChild(chip);
  });
}

chrome.storage.local.get(["urlBlockerRules"], (v) => {
  if (Array.isArray(v.urlBlockerRules)) {
    urlBlockerRules = v.urlBlockerRules;
  } else if (Array.isArray(LOCAL_DEFAULTS.urlBlockerRules)) {
    urlBlockerRules = LOCAL_DEFAULTS.urlBlockerRules;
  } else {
    urlBlockerRules = [];
  }
  renderUrlBlockerRules();
});

chrome.storage.local.get(["dashboardWidgets", "focusModeEnabled", "pomodoroWork", "pomodoroBreak"], (v) => {
  const widgets = v.dashboardWidgets || LOCAL_DEFAULTS.dashboardWidgets || {};
  if (widgetEventsEl) widgetEventsEl.checked = widgets.events !== false;
  if (widgetAddEl) widgetAddEl.checked = widgets.add !== false;
  if (widgetFocusEl) widgetFocusEl.checked = widgets.focus !== false;
  if (widgetTodoEl) widgetTodoEl.checked = widgets.todo !== false;
  if (widgetNewsEl) widgetNewsEl.checked = widgets.news !== false;
  if (widgetMarketsEl) widgetMarketsEl.checked = widgets.markets !== false;
  if (widgetTodoNotionEl) widgetTodoNotionEl.checked = widgets.todoNotion !== false;
  if (focusEnabledEl) {
    focusEnabledEl.checked =
      v.focusModeEnabled === true ||
      (v.focusModeEnabled === undefined && LOCAL_DEFAULTS.focusModeEnabled === true);
  }
  if (pomodoroWorkEl) {
    const fallback = LOCAL_DEFAULTS.pomodoroWork ?? 25;
    pomodoroWorkEl.value = String(v.pomodoroWork ?? fallback);
  }
  if (pomodoroBreakEl) {
    const fallback = LOCAL_DEFAULTS.pomodoroBreak ?? 5;
    pomodoroBreakEl.value = String(v.pomodoroBreak ?? fallback);
  }
});

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

document.getElementById("save").addEventListener("click", async () => {
  const normalizedDbId = normalizeDbId(dbEl.value);
  if (!normalizedDbId) {
    statusEl.textContent = "Error: invalid database ID or URL.";
    return;
  }
  const normalizedTodoDbId = normalizeDbId(todoDbEl?.value || "");
  if (todoDbEl && !normalizedTodoDbId) {
    if (todoStatusEl) todoStatusEl.textContent = "Error: invalid Todo DB ID or URL.";
    return;
  }

  await chrome.storage.sync.set({
    notionToken: tokenEl.value.trim(),
    notionDbId: normalizedDbId,
    ...(normalizedTodoDbId ? { notionTodoDbId: normalizedTodoDbId } : {}),
  });
  const bdfApiKey = bdfApiKeyEl?.value?.trim() || "";
  const googlePlacesApiKey = googlePlacesApiKeyEl?.value?.trim() || "";
  await chrome.storage.local.set({ bdfApiKey, googlePlacesApiKey });

  dbEl.value = normalizedDbId;
  if (todoDbEl && normalizedTodoDbId) todoDbEl.value = normalizedTodoDbId;
  statusEl.textContent = "OK. Saved.";
});


if (urlBlockerSaveBtn) {
  urlBlockerSaveBtn.addEventListener("click", async () => {
    const rules = Array.from(new Set(urlBlockerRules));
    await chrome.storage.local.set({ urlBlockerRules: rules, urlBlockerEnabled: true });
    if (urlBlockerStatusEl) {
      urlBlockerStatusEl.textContent = `Sauvegarde OK (${rules.length} règle(s)).`;
    }
    chrome.runtime.sendMessage({ type: "URL_BLOCKER_RECHECK" }, () => {});
  });
}

if (urlBlockerInputEl) {
  urlBlockerInputEl.addEventListener("keydown", (e) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    const value = (urlBlockerInputEl.value || "").trim();
    if (!value) return;
    if (!urlBlockerRules.includes(value)) {
      urlBlockerRules.push(value);
      renderUrlBlockerRules();
    }
    urlBlockerInputEl.value = "";
  });
}

if (widgetSaveBtn) {
  widgetSaveBtn.addEventListener("click", async () => {
    const dashboardWidgets = {
      events: !!widgetEventsEl?.checked,
      add: !!widgetAddEl?.checked,
      focus: !!widgetFocusEl?.checked,
      todo: !!widgetTodoEl?.checked,
      news: !!widgetNewsEl?.checked,
      markets: !!widgetMarketsEl?.checked,
      todoNotion: !!widgetTodoNotionEl?.checked,
    };
    await chrome.storage.local.set({ dashboardWidgets });
    if (widgetStatusEl) widgetStatusEl.textContent = "Widgets sauvegardés.";
  });
}

if (focusSaveBtn) {
  focusSaveBtn.addEventListener("click", async () => {
    const work = Number.parseInt(pomodoroWorkEl?.value || "25", 10);
    const rest = Number.parseInt(pomodoroBreakEl?.value || "5", 10);
    const focusModeEnabled = !!focusEnabledEl?.checked;
    await chrome.storage.local.set({
      focusModeEnabled,
      pomodoroWork: Number.isFinite(work) ? work : 25,
      pomodoroBreak: Number.isFinite(rest) ? rest : 5,
      urlBlockerEnabled: focusModeEnabled,
    });
    if (focusStatusEl) focusStatusEl.textContent = "Mode focus sauvegardé.";
    chrome.runtime.sendMessage({ type: "URL_BLOCKER_RECHECK" }, () => {});
  });
}

function formatRows(rows, capped) {
  if (!rows || rows.length === 0) return "Aucune ligne chargee.";

  const lines = rows.map((r, i) => {
    const parts = [r.title, r.company, r.status].filter(Boolean).join(" - ");
    const url = r.url ? `\n   ${r.url}` : "";
    return `${i + 1}. ${parts || "Sans titre"}${url}`;
  });

  const capNote = capped ? "\n\n(liste limitee)" : "";
  return `${rows.length} ligne(s) chargee(s)\n\n${lines.join("\n")}${capNote}`;
}

function formatColumns(cols) {
  if (!cols || cols.length === 0) return "Aucune colonne chargee.";
  return `Colonnes (${cols.length})\n\n${cols.join("\n")}`;
}

if (checkBtn) {
  checkBtn.addEventListener("click", async () => {
  statusEl.textContent = "Verification Notion...";
  existingEl.textContent = "Chargement...";
  columnsEl.textContent = "Chargement...";
  checkBtn.disabled = true;

  chrome.runtime.sendMessage({ type: "CHECK_NOTION_DB" }, (res) => {
    checkBtn.disabled = false;
    if (chrome.runtime.lastError) {
      statusEl.textContent = `Erreur extension: ${chrome.runtime.lastError.message}`;
      existingEl.textContent = "Aucune ligne chargee.";
      columnsEl.textContent = "Aucune colonne chargee.";
      refreshDiagnostics(false);
      return;
    }

    if (res?.ok) {
      const title = res.dbTitle ? ` (${res.dbTitle})` : "";
      statusEl.textContent = `Connexion OK${title}.`;
      existingEl.textContent = formatRows(res.rows, res.capped);
      columnsEl.textContent = formatColumns(res.columns);
    } else {
      statusEl.textContent = `Erreur: ${res?.error || "inconnue"}`;
      existingEl.textContent = "Aucune ligne chargee.";
      columnsEl.textContent = "Aucune colonne chargee.";
    }
    refreshDiagnostics(false);
  });
  chrome.runtime.sendMessage({ type: "CHECK_TODO_DB" }, (res) => {
    if (!todoStatusEl) return;
    if (chrome.runtime.lastError) {
      todoStatusEl.textContent = `Erreur extension: ${chrome.runtime.lastError.message}`;
      return;
    }
    if (res?.ok) {
      const title = res.dbTitle ? ` (${res.dbTitle})` : "";
      todoStatusEl.textContent = `Todo DB OK${title}.`;
    } else {
      todoStatusEl.textContent = `Erreur: ${res?.error || "inconnue"}`;
    }
  });
  });
}

function refreshGcalStatus() {
  if (!gcalStatusEl) return;
  gcalStatusEl.textContent = "Verification...";
  chrome.runtime.sendMessage({ type: "GCAL_AUTH_STATUS" }, (res) => {
    if (chrome.runtime.lastError) {
      gcalStatusEl.textContent = `Erreur: ${chrome.runtime.lastError.message}`;
      return;
    }
    if (!res?.ok) {
      gcalStatusEl.textContent = `Erreur: ${res?.error || "inconnue"}`;
      return;
    }
    gcalStatusEl.textContent = res.connected ? "Connecte." : "Non connecte.";
  });
}

function setCalendarOptions(items) {
  if (!gcalDefaultEl) return;
  gcalDefaultEl.innerHTML = "";
  items.forEach((cal) => {
    const opt = document.createElement("option");
    opt.value = cal.id;
    opt.textContent = cal.summary || cal.id;
    gcalDefaultEl.appendChild(opt);
  });
  chrome.storage.local.get(["gcalDefaultCalendar"], (data) => {
    gcalDefaultEl.value =
      data.gcalDefaultCalendar ?? LOCAL_DEFAULTS.gcalDefaultCalendar ?? "primary";
  });
}

function loadCalendarsIntoSelect() {
  if (!gcalDefaultEl) return;
  gcalStatusEl.textContent = "Chargement calendriers...";
  chrome.runtime.sendMessage({ type: "GCAL_LIST_CALENDARS" }, (res) => {
    if (!res?.ok) {
      gcalStatusEl.textContent = `Erreur: ${res?.error || "inconnue"}`;
      return;
    }
    setCalendarOptions(res.items || []);
    gcalStatusEl.textContent = "Calendriers charges.";
  });
}

if (gcalLoginBtn) {
  gcalLoginBtn.addEventListener("click", () => {
    if (!gcalStatusEl) return;
    gcalStatusEl.textContent = "Connexion...";
    chrome.runtime.sendMessage({ type: "GCAL_CONNECT" }, (res) => {
      if (chrome.runtime.lastError) {
        gcalStatusEl.textContent = `Erreur: ${chrome.runtime.lastError.message}`;
        refreshDiagnostics(false);
        return;
      }
      if (!res?.ok) {
        gcalStatusEl.textContent = `Erreur: ${res?.error || "inconnue"}`;
        refreshDiagnostics(false);
        return;
      }
      refreshGcalStatus();
      loadCalendarsIntoSelect();
      refreshDiagnostics(false);
    });
  });
}

if (gcalLogoutBtn) {
  gcalLogoutBtn.addEventListener("click", () => {
    if (!gcalStatusEl) return;
    gcalStatusEl.textContent = "Deconnexion...";
    chrome.runtime.sendMessage({ type: "GCAL_LOGOUT" }, () => {
      refreshGcalStatus();
      refreshDiagnostics(false);
    });
  });
}

refreshGcalStatus();
loadCalendarsIntoSelect();
refreshNotionSyncStatus();

if (gcalRefreshBtn) {
  gcalRefreshBtn.addEventListener("click", loadCalendarsIntoSelect);
}

gcalDefaultEl?.addEventListener("change", () => {
  chrome.storage.local.set({ gcalDefaultCalendar: gcalDefaultEl.value });
});

function refreshNotionSyncStatus() {
  if (!notionSyncEnabledEl) return;
  chrome.runtime.sendMessage({ type: "NOTION_SYNC_STATUS" }, (res) => {
    if (!res?.ok) return;
    notionSyncEnabledEl.checked = !!res.enabled;
  });
}

if (notionSyncEnabledEl) {
  notionSyncEnabledEl.addEventListener("change", () => {
    chrome.runtime.sendMessage({
      type: "NOTION_SYNC_SET",
      payload: { enabled: notionSyncEnabledEl.checked },
    });
  });
}

if (notionSyncNowBtn) {
  notionSyncNowBtn.addEventListener("click", () => {
    if (notionSyncStatusEl) notionSyncStatusEl.textContent = "Sync en cours...";
    chrome.runtime.sendMessage({ type: "NOTION_SYNC_NOW" }, (res) => {
      if (!res?.ok) {
        if (notionSyncStatusEl) notionSyncStatusEl.textContent = `Erreur: ${res?.error || "inconnue"}`;
        refreshDiagnostics(false);
        return;
      }
      if (notionSyncStatusEl) notionSyncStatusEl.textContent = "Sync terminee.";
      refreshDiagnostics(false);
    });
  });
}

function setMapOptions(selectEl, columns) {
  if (!selectEl) return;
  selectEl.innerHTML = "";
  const empty = document.createElement("option");
  empty.value = "";
  empty.textContent = "-";
  selectEl.appendChild(empty);
  columns.forEach((col) => {
    const opt = document.createElement("option");
    opt.value = col;
    opt.textContent = col;
    selectEl.appendChild(opt);
  });
}

function loadMappingUI(columns) {
  Object.values(mapFields).forEach((sel) => setMapOptions(sel, columns));
  chrome.storage.sync.get(["notionFieldMap"], (data) => {
    const map =
      data.notionFieldMap && Object.keys(data.notionFieldMap || {}).length
        ? data.notionFieldMap
        : (SYNC_DEFAULTS.notionFieldMap || {});
    Object.entries(mapFields).forEach(([key, sel]) => {
      if (sel) sel.value = map[key] || "";
    });
  });
  chrome.storage.sync.get(["notionStatusMap"], (data) => {
    const smap =
      data.notionStatusMap && Object.keys(data.notionStatusMap || {}).length
        ? data.notionStatusMap
        : (SYNC_DEFAULTS.notionStatusMap || {});
    if (statusOpenEl) statusOpenEl.value = smap.open || "Ouvert";
    if (statusAppliedEl) statusAppliedEl.value = smap.applied || "Candidature envoyee";
  });
}

function refreshColumns() {
  if (!checkBtn || !mapStatusEl) return;
  mapStatusEl.textContent = "Chargement des colonnes...";
  chrome.runtime.sendMessage({ type: "CHECK_NOTION_DB" }, (res) => {
    if (chrome.runtime.lastError) {
      mapStatusEl.textContent = `Erreur extension: ${chrome.runtime.lastError.message}`;
      return;
    }
    if (!res?.ok) {
      mapStatusEl.textContent = `Erreur: ${res?.error || "inconnue"}`;
      return;
    }
    loadMappingUI(res.columns || []);
    mapStatusEl.textContent = "Colonnes chargees.";
  });
}

if (mapRefreshBtn) {
  mapRefreshBtn.addEventListener("click", refreshColumns);
}

if (mapSaveBtn) {
  mapSaveBtn.addEventListener("click", () => {
    const map = {};
    Object.entries(mapFields).forEach(([key, sel]) => {
      if (sel && sel.value) map[key] = sel.value;
    });
    const statusMap = {
      open: statusOpenEl?.value?.trim() || "Ouvert",
      applied: statusAppliedEl?.value?.trim() || "Candidature envoyee",
    };
    chrome.storage.sync.set({ notionFieldMap: map }, () => {
      if (mapStatusEl) mapStatusEl.textContent = "Mapping enregistre.";
    });
    chrome.storage.sync.set({ notionStatusMap: statusMap });
  });
}

refreshColumns();

function buildTagRow(rule = { tag: "", contains: "" }) {
  const row = document.createElement("div");
  row.className = "tag-row";

  const tagInput = document.createElement("input");
  tagInput.placeholder = "tag";
  tagInput.value = rule.tag || "";

  const containsInput = document.createElement("input");
  containsInput.placeholder = "mots-cles, ex: meeting, zoom";
  containsInput.value = Array.isArray(rule.contains) ? rule.contains.join(", ") : rule.contains || "";

  const delBtn = document.createElement("button");
  delBtn.textContent = "X";
  delBtn.className = "secondary";
  delBtn.addEventListener("click", () => row.remove());

  row.appendChild(tagInput);
  row.appendChild(containsInput);
  row.appendChild(delBtn);

  return row;
}

function loadTagRules() {
  if (!tagRulesEl) return;
  tagRulesEl.innerHTML = "";
  chrome.storage.local.get(["autoTagRules"], (data) => {
    const rules = Array.isArray(data.autoTagRules) && data.autoTagRules.length
      ? data.autoTagRules
      : Array.isArray(LOCAL_DEFAULTS.autoTagRules) && LOCAL_DEFAULTS.autoTagRules.length
        ? LOCAL_DEFAULTS.autoTagRules
        : [
            { tag: "meeting", contains: ["meet.google.com", "zoom.us", "teams.microsoft.com"] },
            { tag: "deadline", contains: ["deadline", "due", "date limite"] },
            { tag: "entretien", contains: ["interview", "entretien"] },
            { tag: "important", contains: ["urgent", "important"] },
          ];
    rules.forEach((rule) => tagRulesEl.appendChild(buildTagRow(rule)));
  });
}

if (tagAddBtn) {
  tagAddBtn.addEventListener("click", () => {
    if (tagRulesEl) tagRulesEl.appendChild(buildTagRow());
  });
}

if (tagSaveBtn) {
  tagSaveBtn.addEventListener("click", () => {
    if (!tagRulesEl) return;
    const rows = Array.from(tagRulesEl.querySelectorAll(".tag-row"));
    const rules = rows
      .map((row) => {
        const inputs = row.querySelectorAll("input");
        const tag = inputs[0]?.value?.trim();
        const contains = inputs[1]?.value
          ?.split(",")
          .map((s) => s.trim())
          .filter(Boolean);
        if (!tag || !contains?.length) return null;
        return { tag, contains };
      })
      .filter(Boolean);
    chrome.storage.local.set({ autoTagRules: rules }, () => {
      if (tagStatusEl) tagStatusEl.textContent = "Regles enregistrees.";
    });
  });
}

loadTagRules();

function loadDeadlinePrefs() {
  chrome.runtime.sendMessage({ type: "DEADLINE_GET_PREFS" }, (res) => {
    const prefs =
      res?.prefs ||
      LOCAL_DEFAULTS.deadlinePrefs ||
      { enabled: true, offsets: [24, 72, 168] };
    if (deadlineEnabledEl) deadlineEnabledEl.checked = !!prefs.enabled;
    if (deadlineOffsetsEl) deadlineOffsetsEl.value = (prefs.offsets || []).join(", ");
  });
}

if (deadlineSaveBtn) {
  deadlineSaveBtn.addEventListener("click", () => {
    const enabled = !!deadlineEnabledEl?.checked;
    const offsets = (deadlineOffsetsEl?.value || "")
      .split(",")
      .map((s) => Number.parseInt(s.trim(), 10))
      .filter((n) => Number.isFinite(n) && n > 0);
    const prefs = { enabled, offsets: offsets.length ? offsets : [24, 72, 168] };
    chrome.runtime.sendMessage({ type: "DEADLINE_SET_PREFS", payload: prefs }, () => {
      if (deadlineStatusEl) deadlineStatusEl.textContent = "Preferences enregistrees.";
    });
  });
}

loadDeadlinePrefs();

function formatDateTime(ts) {
  if (!ts) return "-";
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleString();
}

function formatDetails(details) {
  if (!details || typeof details !== "object") return "";
  const parts = Object.entries(details)
    .filter(([, v]) => v !== null && v !== undefined && v !== "")
    .map(([k, v]) => `${k}=${v}`);
  return parts.length ? ` (${parts.join(", ")})` : "";
}

function formatSyncStats(stats) {
  if (!stats || typeof stats !== "object" || Object.keys(stats).length === 0) {
    return "Aucune donnée.";
  }
  const entries = Object.entries(stats)
    .map(([name, value]) => ({ name, value: value || {} }))
    .sort((a, b) => (b.value.at || 0) - (a.value.at || 0));
  const lines = entries.map(({ name, value }) => {
    const when = formatDateTime(value.at);
    const status = value.status || "unknown";
    const details = formatDetails(value.details);
    return `${name}: ${status} @ ${when}${details}`;
  });
  return lines.join("\n");
}

function formatErrors(errors) {
  if (!Array.isArray(errors) || errors.length === 0) {
    return [];
  }
  const counts = new Map();
  errors.forEach((err) => {
    const type = err?.code || err?.context || "unknown";
    const entry = counts.get(type) || { type, count: 0, sample: err };
    entry.count += 1;
    counts.set(type, entry);
  });
  return Array.from(counts.values()).sort((a, b) => b.count - a.count);
}

function getErrorRecommendation(err) {
  const code = String(err?.code || "").toUpperCase();
  const ctx = String(err?.context || "").toLowerCase();
  const msg = String(err?.message || err?.rawMessage || "").toLowerCase();

  if (code.includes("AUTH_REQUIRED")) return "Reconnecte Google dans Options.";
  if (code.includes("NOTION_CONFIG_MISSING")) return "Renseigne Token + Database ID.";
  if (code.includes("NOTION_DB_ID_INVALID") || code.includes("NOTION_DB_NOT_FOUND")) {
    return "Vérifie l’ID/URL de la base Notion.";
  }
  if (code.includes("PLACES_KEY_MISSING")) return "Ajoute une clé Google Places.";
  if (code.includes("GCAL_CALENDAR_ID_MISSING")) return "Sélectionne un calendrier par défaut.";
  if (code.includes("HTTP_401")) return "Vérifie les identifiants/droits d’accès.";
  if (code.includes("HTTP_403")) return "Vérifie les permissions (writer/owner).";
  if (msg.includes("writer access")) return "Choisis un calendrier avec accès en écriture.";
  if (ctx.includes("notion")) return "Vérifie la configuration Notion.";
  if (ctx.includes("google")) return "Revalide la connexion Google.";
  return "Réessaye ou vérifie la configuration associée.";
}

function renderErrorTable(errors) {
  if (!diagErrorsEl) return;
  diagErrorsEl.innerHTML = "";
  const summary = formatErrors(errors);
  if (summary.length === 0) {
    const row = document.createElement("tr");
    const cell = document.createElement("td");
    cell.colSpan = 3;
    cell.className = "diag-empty";
    cell.textContent = "Aucune erreur.";
    row.appendChild(cell);
    diagErrorsEl.appendChild(row);
    return;
  }

  summary.forEach((entry) => {
    const row = document.createElement("tr");
    const typeCell = document.createElement("td");
    typeCell.textContent = entry.type;
    const countCell = document.createElement("td");
    countCell.textContent = String(entry.count);
    const recCell = document.createElement("td");
    recCell.textContent = getErrorRecommendation(entry.sample);
    row.appendChild(typeCell);
    row.appendChild(countCell);
    row.appendChild(recCell);
    diagErrorsEl.appendChild(row);
  });
}

function renderDiagnostics(res) {
  if (!diagSyncStatsEl || !diagErrorsEl) return;
  if (diagLastSyncEl) diagLastSyncEl.textContent = formatDateTime(res?.lastSyncAt);
  if (diagOfflineQueueEl) {
    diagOfflineQueueEl.textContent = `${res?.offlineQueueCount ?? 0} element(s)`;
  }
  diagSyncStatsEl.textContent = formatSyncStats(res?.syncStats);
  renderErrorTable(res?.recentErrors);

  const tests = res?.tests || null;
  if (tests?.notion) {
    if (diagNotionTestEl) {
      diagNotionTestEl.textContent =
        tests.notion.message || (tests.notion.ok ? "OK" : "Erreur");
    }
  } else {
    if (diagNotionTestEl) {
      diagNotionTestEl.textContent = res?.notionConfigured
        ? "Configure (non teste)"
        : "Non configure";
    }
  }
  if (tests?.google) {
    if (diagGoogleTestEl) {
      diagGoogleTestEl.textContent =
        tests.google.message || (tests.google.ok ? "OK" : "Erreur");
    }
  } else {
    if (diagGoogleTestEl) {
      diagGoogleTestEl.textContent = res?.googleConnected
        ? "Connecte (non teste)"
        : "Non connecte";
    }
  }
}

function setDiagnosticsLoading(label) {
  if (diagLastSyncEl) diagLastSyncEl.textContent = label;
  if (diagNotionTestEl) diagNotionTestEl.textContent = label;
  if (diagGoogleTestEl) diagGoogleTestEl.textContent = label;
  if (diagOfflineQueueEl) diagOfflineQueueEl.textContent = label;
}

function refreshDiagnostics(runTests) {
  if (!diagRefreshBtn && !diagRunTestsBtn) return;
  const type = runTests ? "DIAG_RUN_TESTS" : "DIAG_GET_STATUS";
  setDiagnosticsLoading(runTests ? "Tests en cours..." : "Chargement...");
  chrome.runtime.sendMessage({ type }, (res) => {
    if (chrome.runtime.lastError) {
      const msg = chrome.runtime.lastError.message || "Erreur extension";
      if (diagErrorsEl) diagErrorsEl.textContent = msg;
      return;
    }
    if (!res?.ok) {
      if (diagErrorsEl) diagErrorsEl.textContent = res?.error || "Erreur inconnue";
      return;
    }
    renderDiagnostics(res);
  });
}

if (diagRefreshBtn) {
  diagRefreshBtn.addEventListener("click", () => refreshDiagnostics(false));
}

if (diagRunTestsBtn) {
  diagRunTestsBtn.addEventListener("click", () => refreshDiagnostics(true));
}

if (diagClearErrorsBtn) {
  diagClearErrorsBtn.addEventListener("click", () => {
    chrome.runtime.sendMessage({ type: "DIAG_CLEAR_ERRORS" }, () => {
      refreshDiagnostics(false);
    });
  });
}

refreshDiagnostics(false);

async function exportConfig() {
  const syncData = await chrome.storage.sync.get([
    "notionToken",
    "notionDbId",
    "notionTodoDbId",
    "notionFieldMap",
  ]);
  const localData = await chrome.storage.local.get([
    "gcalDefaultCalendar",
    "gcalSelectedCalendars",
    "gcalNotifyCalendars",
    "yahooNewsPrefs",
    "autoTagRules",
    "deadlinePrefs",
    "notionCalendarSyncEnabled",
    "bdfApiKey",
    "googlePlacesApiKey",
    "urlBlockerRules",
    "urlBlockerEnabled",
    "dashboardWidgets",
    "focusModeEnabled",
    "pomodoroWork",
    "pomodoroBreak",
  ]);
  return { sync: syncData, local: localData };
}

async function importConfig(obj) {
  if (obj?.sync) await chrome.storage.sync.set(obj.sync);
  if (obj?.local) await chrome.storage.local.set(obj.local);
}

if (exportBtn) {
  exportBtn.addEventListener("click", async () => {
    const data = await exportConfig();
    if (configDataEl) configDataEl.value = JSON.stringify(data, null, 2);
    if (configStatusEl) configStatusEl.textContent = "Configuration exportee.";
  });
}

if (importBtn) {
  importBtn.addEventListener("click", async () => {
    try {
      const parsed = JSON.parse(configDataEl?.value || "{}");
      await importConfig(parsed);
      if (configStatusEl) configStatusEl.textContent = "Configuration importee.";
      refreshGcalStatus();
      loadCalendarsIntoSelect();
      refreshNotionSyncStatus();
      loadTagRules();
      loadDeadlinePrefs();
      if (urlBlockerListEl) {
        urlBlockerRules = Array.isArray(parsed?.local?.urlBlockerRules)
          ? parsed.local.urlBlockerRules
          : [];
        renderUrlBlockerRules();
      }
      if (widgetEventsEl) {
        const widgets = parsed?.local?.dashboardWidgets || {};
        widgetEventsEl.checked = widgets.events !== false;
        widgetAddEl.checked = widgets.add !== false;
        widgetFocusEl.checked = widgets.focus !== false;
        widgetTodoEl.checked = widgets.todo !== false;
        widgetNewsEl.checked = widgets.news !== false;
        widgetMarketsEl.checked = widgets.markets !== false;
        widgetTodoNotionEl.checked = widgets.todoNotion !== false;
      }
      if (todoDbEl) todoDbEl.value = parsed?.sync?.notionTodoDbId || "";
      if (focusEnabledEl) focusEnabledEl.checked = parsed?.local?.focusModeEnabled === true;
      if (pomodoroWorkEl) pomodoroWorkEl.value = String(parsed?.local?.pomodoroWork || 25);
      if (pomodoroBreakEl) pomodoroBreakEl.value = String(parsed?.local?.pomodoroBreak || 5);
      refreshColumns();
      refreshDiagnostics(false);
    } catch (e) {
      if (configStatusEl) configStatusEl.textContent = "JSON invalide.";
    }
  });
}
