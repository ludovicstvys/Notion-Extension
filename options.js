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
const gcalReminderDefaultEl = document.getElementById("gcal-reminder-default");
const gcalReminderMeetingEl = document.getElementById("gcal-reminder-meeting");
const gcalReminderEntretienEl = document.getElementById("gcal-reminder-entretien");
const gcalReminderDeadlineEl = document.getElementById("gcal-reminder-deadline");
const gcalReminderSaveBtn = document.getElementById("gcal-reminder-save");
const gcalReminderStatusEl = document.getElementById("gcal-reminder-status");
const externalIcalUrlEl = document.getElementById("external-ical-url");
const externalIcalSaveBtn = document.getElementById("external-ical-save");
const externalIcalStatusEl = document.getElementById("external-ical-status");
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

function normalizeHttpUrl(input) {
  const raw = (input || "").trim();
  if (!raw) return "";
  try {
    const url = new URL(raw);
    if (url.protocol !== "http:" && url.protocol !== "https:") return "";
    return url.toString();
  } catch (_) {
    return "";
  }
}

function parseReminderOffsets(value) {
  const list = String(value || "")
    .split(",")
    .map((s) => Number.parseInt(s.trim(), 10))
    .filter((n) => Number.isFinite(n) && n > 0);
  return list.length ? list : [];
}

function formatReminderOffsets(list, fallback) {
  const arr = Array.isArray(list) && list.length ? list : fallback;
  return arr.join(",");
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

function formatRows(rows, _capped) {
  if (!rows || rows.length === 0) return "Aucune ligne chargee.";

  const lines = rows.map((r, i) => {
    const parts = [r.title, r.company, r.status].filter(Boolean).join(" - ");
    const url = r.url ? `\n   ${r.url}` : "";
    return `${i + 1}. ${parts || "Sans titre"}${url}`;
  });

  return `${rows.length} ligne(s) chargee(s)\n\n${lines.join("\n")}`;
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

function waitMs(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function sendRuntimeMessage(message, attempts = 2) {
  const maxAttempts = Math.max(1, Number.parseInt(attempts, 10) || 1);
  return new Promise((resolve) => {
    const run = (attempt) => {
      chrome.runtime.sendMessage(message, (res) => {
        const runtimeError = chrome.runtime.lastError;
        if (runtimeError) {
          const text = String(runtimeError.message || "").toLowerCase();
          const retryable =
            text.includes("message port closed") ||
            text.includes("receiving end does not exist") ||
            text.includes("could not establish connection");
          if (retryable && attempt < maxAttempts) {
            setTimeout(() => run(attempt + 1), 150);
            return;
          }
          resolve({ ok: false, error: runtimeError.message || "Erreur extension inconnue." });
          return;
        }
        if (res === undefined && attempt < maxAttempts) {
          setTimeout(() => run(attempt + 1), 150);
          return;
        }
        resolve(res || { ok: false, error: "Aucune reponse du service worker." });
      });
    };
    run(1);
  });
}

function requestGoogleTokenInteractive() {
  return new Promise((resolve, reject) => {
    if (!chrome?.identity?.getAuthToken) {
      reject(new Error("API Google Identity indisponible."));
      return;
    }
    chrome.identity.getAuthToken({ interactive: true }, (token) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message || "Connexion Google impossible."));
        return;
      }
      if (!token) {
        reject(new Error("Aucun token Google recu."));
        return;
      }
      resolve(token);
    });
  });
}

function isGoogleAuthCancelled(message) {
  const text = String(message || "").toLowerCase();
  return text.includes("user did not approve") || text.includes("access_denied") || text.includes("cancel");
}

async function connectGoogleRobust() {
  try {
    await requestGoogleTokenInteractive();
    return { ok: true };
  } catch (directErr) {
    if (isGoogleAuthCancelled(directErr?.message)) {
      return { ok: false, error: directErr?.message || "Connexion Google annulee." };
    }
    const fallback = await sendRuntimeMessage({ type: "GCAL_CONNECT" }, 2);
    if (fallback?.ok) return fallback;
    const directMessage = directErr?.message || "";
    const fallbackMessage = fallback?.error || "";
    return {
      ok: false,
      error: fallbackMessage || directMessage || "Connexion Google impossible.",
    };
  }
}

let gcalConnectionState = null;

function setGcalStatus(text = "") {
  if (!gcalStatusEl) return;
  let prefix = "Statut inconnu.";
  if (gcalConnectionState === true) prefix = "Connecte.";
  if (gcalConnectionState === false) prefix = "Non connecte.";
  const detail = String(text || "").trim();
  gcalStatusEl.textContent = detail ? `${prefix} ${detail}` : prefix;
}

function setGcalStatusRaw(text) {
  if (!gcalStatusEl) return;
  gcalStatusEl.textContent = String(text || "").trim();
}

async function refreshGcalStatus() {
  if (!gcalStatusEl) return { ok: false, error: "Status UI indisponible." };
  setGcalStatusRaw("Verification connexion...");
  const res = await sendRuntimeMessage({ type: "GCAL_AUTH_STATUS" }, 2);
  if (!res?.ok) {
    setGcalStatusRaw(`Erreur: ${res?.error || "inconnue"}`);
    return res || { ok: false, error: "inconnue" };
  }
  gcalConnectionState = !!res.connected;
  setGcalStatus();
  return res;
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

async function loadCalendarsIntoSelect(options = {}) {
  if (!gcalDefaultEl || !gcalStatusEl) return { ok: false, error: "UI indisponible." };
  const tries = Math.max(1, Number.parseInt(options?.retries, 10) || 1);
  if (gcalConnectionState === null) {
    setGcalStatusRaw("Chargement calendriers...");
  } else {
    setGcalStatus("Chargement calendriers...");
  }

  let res = null;
  for (let attempt = 1; attempt <= tries; attempt += 1) {
    res = await sendRuntimeMessage({ type: "GCAL_LIST_CALENDARS" }, 2);
    if (res?.ok) break;
    if (attempt < tries) {
      await waitMs(250);
    }
  }

  if (!res?.ok) {
    const errText = res?.error || "inconnue";
    if (
      res?.code === "AUTH_REQUIRED" ||
      /authentification|oauth|token|reconnecte/i.test(String(errText))
    ) {
      gcalConnectionState = false;
    }
    if (gcalConnectionState === null) {
      setGcalStatusRaw(`Erreur: ${errText}`);
    } else {
      setGcalStatus(`Erreur calendriers: ${errText}`);
    }
    return res || { ok: false, error: "inconnue" };
  }
  gcalConnectionState = true;
  setCalendarOptions(res.items || []);
  const count = Array.isArray(res.items) ? res.items.length : 0;
  setGcalStatus(`Calendriers charges (${count}).`);
  return res;
}

let gcalConnectInProgress = false;
let gcalLogoutInProgress = false;

if (gcalLoginBtn) {
  gcalLoginBtn.addEventListener("click", async () => {
    if (!gcalStatusEl || gcalConnectInProgress) return;
    gcalConnectInProgress = true;
    gcalLoginBtn.disabled = true;
    if (gcalLogoutBtn) gcalLogoutBtn.disabled = true;
    if (gcalRefreshBtn) gcalRefreshBtn.disabled = true;
    setGcalStatusRaw("Connexion...");
    try {
      const connectRes = await connectGoogleRobust();
      if (!connectRes?.ok) {
        setGcalStatusRaw(`Erreur: ${connectRes?.error || "inconnue"}`);
        return;
      }

      let connected = false;
      for (let i = 0; i < 3; i += 1) {
        const status = await sendRuntimeMessage({ type: "GCAL_AUTH_STATUS" }, 2);
        if (status?.ok && status.connected) {
          connected = true;
          break;
        }
        await waitMs(250);
      }
      if (!connected) {
        gcalConnectionState = false;
        setGcalStatus("Connexion non confirmee.");
        return;
      }
      gcalConnectionState = true;

      const calendarsRes = await loadCalendarsIntoSelect({ retries: 3 });
      if (!calendarsRes?.ok) return;
      await refreshGcalStatus();
    } finally {
      gcalConnectInProgress = false;
      gcalLoginBtn.disabled = false;
      if (gcalLogoutBtn) gcalLogoutBtn.disabled = false;
      if (gcalRefreshBtn) gcalRefreshBtn.disabled = false;
      refreshDiagnostics(false);
    }
  });
}

if (gcalLogoutBtn) {
  gcalLogoutBtn.addEventListener("click", async () => {
    if (!gcalStatusEl || gcalLogoutInProgress) return;
    gcalLogoutInProgress = true;
    gcalLogoutBtn.disabled = true;
    if (gcalLoginBtn) gcalLoginBtn.disabled = true;
    if (gcalRefreshBtn) gcalRefreshBtn.disabled = true;
    setGcalStatusRaw("Deconnexion...");
    try {
      const res = await sendRuntimeMessage({ type: "GCAL_LOGOUT" }, 2);
      if (!res?.ok) {
        setGcalStatusRaw(`Erreur: ${res?.error || "inconnue"}`);
        return;
      }
      gcalConnectionState = false;
      if (gcalDefaultEl) gcalDefaultEl.innerHTML = "";
      await refreshGcalStatus();
    } finally {
      gcalLogoutInProgress = false;
      gcalLogoutBtn.disabled = false;
      if (gcalLoginBtn) gcalLoginBtn.disabled = false;
      if (gcalRefreshBtn) gcalRefreshBtn.disabled = false;
      refreshDiagnostics(false);
    }
  });
}

(async () => {
  const status = await refreshGcalStatus();
  if (status?.ok && status.connected) {
    await loadCalendarsIntoSelect({ retries: 2 });
  } else if (gcalDefaultEl) {
    gcalDefaultEl.innerHTML = "";
  }
})();
refreshNotionSyncStatus();

if (gcalRefreshBtn) {
  gcalRefreshBtn.addEventListener("click", () => {
    loadCalendarsIntoSelect({ retries: 2 });
  });
}

gcalDefaultEl?.addEventListener("change", () => {
  chrome.storage.local.set({ gcalDefaultCalendar: gcalDefaultEl.value });
});

function loadGcalReminderPrefs() {
  chrome.runtime.sendMessage({ type: "GCAL_GET_REMINDER_PREFS" }, (res) => {
    if (!res?.ok) return;
    const prefs = res.prefs || {};
    if (gcalReminderDefaultEl) gcalReminderDefaultEl.value = formatReminderOffsets(prefs.default, [30]);
    if (gcalReminderMeetingEl) gcalReminderMeetingEl.value = formatReminderOffsets(prefs.meeting, [30]);
    if (gcalReminderEntretienEl) {
      gcalReminderEntretienEl.value = formatReminderOffsets(prefs.entretien, [120, 30]);
    }
    if (gcalReminderDeadlineEl) {
      gcalReminderDeadlineEl.value = formatReminderOffsets(prefs.deadline, [1440, 60]);
    }
  });
}

if (gcalReminderSaveBtn) {
  gcalReminderSaveBtn.addEventListener("click", () => {
    const prefs = {
      default: parseReminderOffsets(gcalReminderDefaultEl?.value || "30"),
      meeting: parseReminderOffsets(gcalReminderMeetingEl?.value || "30"),
      entretien: parseReminderOffsets(gcalReminderEntretienEl?.value || "120,30"),
      deadline: parseReminderOffsets(gcalReminderDeadlineEl?.value || "1440,60"),
    };
    chrome.runtime.sendMessage({ type: "GCAL_SET_REMINDER_PREFS", payload: { prefs } }, (res) => {
      if (!gcalReminderStatusEl) return;
      gcalReminderStatusEl.textContent = res?.ok
        ? "Rappels enregistrés."
        : `Erreur: ${res?.error || "inconnue"}`;
    });
  });
}

loadGcalReminderPrefs();

chrome.storage.local.get(["externalIcalUrl"], (data) => {
  if (!externalIcalUrlEl) return;
  externalIcalUrlEl.value = data.externalIcalUrl ?? LOCAL_DEFAULTS.externalIcalUrl ?? "";
});

if (externalIcalSaveBtn) {
  externalIcalSaveBtn.addEventListener("click", async () => {
    const raw = externalIcalUrlEl?.value || "";
    const normalized = normalizeHttpUrl(raw);
    if (raw.trim() && !normalized) {
      if (externalIcalStatusEl) externalIcalStatusEl.textContent = "Lien invalide (http/https).";
      return;
    }
    await chrome.storage.local.set({ externalIcalUrl: normalized });
    if (externalIcalUrlEl) externalIcalUrlEl.value = normalized;
    if (externalIcalStatusEl) {
      externalIcalStatusEl.textContent = normalized
        ? "Lien iCal enregistré."
        : "Lien iCal supprimé.";
    }
  });
}

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

function fileStamp(d = new Date()) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  const ss = String(d.getSeconds()).padStart(2, "0");
  return `${yyyy}${mm}${dd}-${hh}${min}${ss}`;
}

function downloadTextFile(filename, content) {
  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function exportConfig() {
  const syncData = await chrome.storage.sync.get(null);
  const localData = await chrome.storage.local.get(null);
  return {
    format: "notion-extension-connections-v1",
    exportedAt: new Date().toISOString(),
    includesSensitiveData: true,
    sync: syncData || {},
    local: localData || {},
  };
}

async function importConfig(obj) {
  if (obj?.sync) await chrome.storage.sync.set(obj.sync);
  if (obj?.local) await chrome.storage.local.set(obj.local);
}

if (exportBtn) {
  exportBtn.addEventListener("click", async () => {
    const data = await exportConfig();
    const text = JSON.stringify(data, null, 2);
    if (configDataEl) configDataEl.value = text;
    const filename = `connections-config-${fileStamp()}.txt`;
    downloadTextFile(filename, text);
    if (configStatusEl) {
      configStatusEl.textContent =
        "Configuration exportee en .txt (contient des donnees sensibles).";
    }
  });
}

if (importBtn) {
  importBtn.addEventListener("click", async () => {
    try {
      const parsed = JSON.parse(configDataEl?.value || "{}");
      await importConfig(parsed);
      if (configStatusEl) configStatusEl.textContent = "Configuration importee.";
      const auth = await refreshGcalStatus();
      if (auth?.ok && auth.connected) {
        await loadCalendarsIntoSelect({ retries: 2 });
      } else if (gcalDefaultEl) {
        gcalDefaultEl.innerHTML = "";
      }
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
      if (externalIcalUrlEl) externalIcalUrlEl.value = parsed?.local?.externalIcalUrl || "";
      if (parsed?.local?.gcalReminderPrefs) {
        chrome.runtime.sendMessage({
          type: "GCAL_SET_REMINDER_PREFS",
          payload: { prefs: parsed.local.gcalReminderPrefs },
        });
        loadGcalReminderPrefs();
      }
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
