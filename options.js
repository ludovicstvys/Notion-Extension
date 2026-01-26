const tokenEl = document.getElementById("token");
const dbEl = document.getElementById("db");
const statusEl = document.getElementById("status");
const checkBtn = document.getElementById("check");
const existingEl = document.getElementById("existing");
const columnsEl = document.getElementById("columns");
const gcalLoginBtn = document.getElementById("gcal-login");
const gcalLogoutBtn = document.getElementById("gcal-logout");
const gcalStatusEl = document.getElementById("gcal-status");
const gcalDefaultEl = document.getElementById("gcal-default");
const gcalRefreshBtn = document.getElementById("gcal-refresh");
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

chrome.storage.sync.get(["notionToken", "notionDbId"], (v) => {
  tokenEl.value = v.notionToken || "";
  dbEl.value = v.notionDbId || "";
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

  await chrome.storage.sync.set({
    notionToken: tokenEl.value.trim(),
    notionDbId: normalizedDbId,
  });

  dbEl.value = normalizedDbId;
  statusEl.textContent = "OK. Saved.";
});

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
    gcalDefaultEl.value = data.gcalDefaultCalendar || "primary";
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
        return;
      }
      if (!res?.ok) {
        gcalStatusEl.textContent = `Erreur: ${res?.error || "inconnue"}`;
        return;
      }
      refreshGcalStatus();
      loadCalendarsIntoSelect();
    });
  });
}

if (gcalLogoutBtn) {
  gcalLogoutBtn.addEventListener("click", () => {
    if (!gcalStatusEl) return;
    gcalStatusEl.textContent = "Deconnexion...";
    chrome.runtime.sendMessage({ type: "GCAL_LOGOUT" }, () => {
      refreshGcalStatus();
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
        return;
      }
      if (notionSyncStatusEl) notionSyncStatusEl.textContent = "Sync terminee.";
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
    const map = data.notionFieldMap || {};
    Object.entries(mapFields).forEach(([key, sel]) => {
      if (sel) sel.value = map[key] || "";
    });
  });
  chrome.storage.sync.get(["notionStatusMap"], (data) => {
    const smap = data.notionStatusMap || {};
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
    const prefs = res?.prefs || { enabled: true, offsets: [24, 48, 168] };
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
    const prefs = { enabled, offsets: offsets.length ? offsets : [24, 48, 168] };
    chrome.runtime.sendMessage({ type: "DEADLINE_SET_PREFS", payload: prefs }, () => {
      if (deadlineStatusEl) deadlineStatusEl.textContent = "Preferences enregistrees.";
    });
  });
}

loadDeadlinePrefs();

async function exportConfig() {
  const syncData = await chrome.storage.sync.get([
    "notionToken",
    "notionDbId",
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
      refreshColumns();
    } catch (e) {
      if (configStatusEl) configStatusEl.textContent = "JSON invalide.";
    }
  });
}
