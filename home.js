const eventsStatusEl = document.getElementById("home-events-status");
const eventsEl = document.getElementById("home-events");
const todoStatusEl = document.getElementById("home-todo-status");
const todoEl = document.getElementById("home-todo");
const newsStatusEl = document.getElementById("home-news-status");
const newsEl = document.getElementById("home-news");
const focusStatusEl = document.getElementById("focus-status");
const focusEl = document.getElementById("focus-list");
const addBtn = document.getElementById("home-add");
const appliedCb = document.getElementById("home-applied");
const addStatusEl = document.getElementById("home-add-status");
const timelineStatusEl = document.getElementById("timeline-status");
const timelineListEl = document.getElementById("timeline-list");
const focusSwitchEl = document.getElementById("focus-switch");
const pomodoroTimerEl = document.getElementById("pomodoro-timer");
const pomodoroStartBtn = document.getElementById("pomodoro-start");
const pomodoroPauseBtn = document.getElementById("pomodoro-pause");
const pomodoroResetBtn = document.getElementById("pomodoro-reset");
const widgetSections = Array.from(document.querySelectorAll("[data-widget]"));
const focusData = { events: [], todos: [] };
let extracted = null;
let pomodoroInterval = null;
let pomodoroMode = "work";
let pomodoroRemaining = 25 * 60;
let pomodoroWorkMinutes = 25;
let pomodoroBreakMinutes = 5;

function normalizeText(input) {
  const text = (input ?? "").toString();
  return text.normalize("NFC").trim();
}

function formatEventTime(ev) {
  const start = ev.start ? new Date(ev.start) : null;
  if (!start) return "";
  if (ev.start.length === 10) return start.toLocaleDateString();
  return start.toLocaleString();
}

function formatTimeLeft(seconds) {
  const s = Math.max(0, seconds);
  const m = Math.floor(s / 60);
  const r = String(s % 60).padStart(2, "0");
  return `${m}:${r}`;
}

function updatePomodoroDisplay() {
  if (!pomodoroTimerEl) return;
  pomodoroTimerEl.textContent = formatTimeLeft(pomodoroRemaining);
}

function startPomodoro() {
  if (pomodoroInterval) return;
  pomodoroInterval = setInterval(() => {
    pomodoroRemaining -= 1;
    if (pomodoroRemaining <= 0) {
      pomodoroMode = pomodoroMode === "work" ? "break" : "work";
      pomodoroRemaining =
        (pomodoroMode === "work" ? pomodoroWorkMinutes : pomodoroBreakMinutes) * 60;
    }
    updatePomodoroDisplay();
  }, 1000);
}

function pausePomodoro() {
  if (pomodoroInterval) {
    clearInterval(pomodoroInterval);
    pomodoroInterval = null;
  }
}

function resetPomodoro() {
  pomodoroMode = "work";
  pomodoroRemaining = pomodoroWorkMinutes * 60;
  updatePomodoroDisplay();
}

function applyWidgetPreferences() {
  chrome.storage.local.get(["dashboardWidgets"], (data) => {
    const prefs = data.dashboardWidgets || {};
    widgetSections.forEach((section) => {
      const key = section.getAttribute("data-widget");
      if (!key) return;
      if (prefs[key] === false) {
        section.style.display = "none";
      } else {
        section.style.display = "";
      }
    });
  });
}

function scrapeJobInfo() {
  const url = location.href;

  const getMeta = (sel) => document.querySelector(sel)?.content?.trim() || "";
  const ogTitle = getMeta('meta[property="og:title"]');
  const ogDesc = getMeta('meta[property="og:description"]') || getMeta('meta[name="description"]');

  function extractDateText(input) {
    const text = (input || "").replace(/\s+/g, " ").trim();
    if (!text) return "";

    const monthYear =
      /\b(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+\d{4}\b/i;
    if (monthYear.test(text)) return text.match(monthYear)[0];

    const datePattern = /\b\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4}\b/;
    if (datePattern.test(text)) return text.match(datePattern)[0];

    return "";
  }

  const jsonLd = Array.from(document.querySelectorAll('script[type="application/ld+json"]'))
    .map((el) => {
      try {
        return JSON.parse(el.textContent || "{}");
      } catch (_) {
        return null;
      }
    })
    .filter(Boolean);

  const job = jsonLd
    .flatMap((item) => (Array.isArray(item) ? item : [item]))
    .find((item) => item?.["@type"] === "JobPosting");

  const title = job?.title || ogTitle || document.title || "";
  const company = job?.hiringOrganization?.name || getMeta('meta[name="company"]') || "";
  const locationStr =
    job?.jobLocation?.address?.addressLocality ||
    job?.jobLocation?.address?.addressRegion ||
    job?.jobLocation?.address?.addressCountry ||
    getMeta('meta[property="job:location"]') ||
    "";
  const datePosted = extractDateText(job?.datePosted || "");
  const startDate = extractDateText(job?.jobStartDate || "");
  const deadline = extractDateText(job?.validThrough || "");
  const description = job?.description || ogDesc || "";

  return {
    title,
    company,
    location: locationStr,
    datePosted,
    startDate,
    deadline,
    description,
    url,
    source: location.hostname,
  };
}

async function extractFromPage() {
  if (addStatusEl) addStatusEl.textContent = "Extraction...";
  if (addBtn) addBtn.disabled = true;
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: scrapeJobInfo,
    });
    extracted = result;
    if (addStatusEl) addStatusEl.textContent = "Prêt à ajouter.";
    if (addBtn) addBtn.disabled = false;
    return true;
  } catch (err) {
    if (addStatusEl) {
      addStatusEl.textContent = `Impossible d'extraire: ${err?.message || err}`;
    }
    if (addBtn) addBtn.disabled = false;
    return false;
  }
}

if (addBtn) {
  addBtn.addEventListener("click", async () => {
    const ok = await extractFromPage();
    if (!ok || !extracted) return;
    if (addStatusEl) addStatusEl.textContent = "Envoi a Notion...";

    const payload = { ...extracted, applied: !!appliedCb?.checked };
    chrome.runtime.sendMessage({ type: "UPSERT_NOTION", payload }, (res) => {
      if (chrome.runtime.lastError) {
        if (addStatusEl) {
          addStatusEl.textContent = `Erreur extension: ${chrome.runtime.lastError.message}`;
        }
        return;
      }

      if (res?.ok) {
        const label = res.mode === "queued" ? "en attente (offline)" : res.mode;
        if (addStatusEl) addStatusEl.textContent = `Ajoute / mis a jour (${label})`;
      } else if (addStatusEl) {
        addStatusEl.textContent = `Erreur: ${res?.error || "inconnue"}`;
      }
    });
  });
}

function makeEventChip(ev) {
  const chip = document.createElement("div");
  chip.className = "event-chip";
  chip.tabIndex = 0;

  const title = document.createElement("div");
  title.className = "event-title";
  title.textContent = normalizeText(ev.summary || "Evenement");

  const meta = document.createElement("div");
  meta.className = "event-meta";
  meta.textContent = formatEventTime(ev);

  chip.appendChild(title);
  if (meta.textContent) chip.appendChild(meta);

  const url = ev.meetingLink || ev.htmlLink || "";
  if (url) {
    chip.addEventListener("click", () => {
      window.open(url, "_blank", "noreferrer");
    });
    chip.addEventListener("keydown", (e) => {
      if (e.key === "Enter") window.open(url, "_blank", "noreferrer");
    });
  }
  return chip;
}

function renderEvents(items) {
  eventsEl.innerHTML = "";
  if (!items || items.length === 0) {
    eventsStatusEl.textContent = "Aucun evenement a venir.";
    return;
  }
  eventsStatusEl.textContent = "";
  items.forEach((ev) => eventsEl.appendChild(makeEventChip(ev)));
}

function renderFocus(items) {
  focusEl.innerHTML = "";
  if (!items || items.length === 0) {
    focusStatusEl.textContent = "Rien de critique aujourd'hui.";
    return;
  }
  focusStatusEl.textContent = "";
  items.forEach((item) => {
    const row = document.createElement("div");
    row.className = "event-chip";
    const title = document.createElement("div");
    title.className = "event-title";
    title.textContent = item.title || "Action";
    const meta = document.createElement("div");
    meta.className = "event-meta";
    meta.textContent = item.meta || "";
    row.appendChild(title);
    if (meta.textContent) row.appendChild(meta);
    row.tabIndex = 0;
    if (item.link) {
      row.addEventListener("click", () => {
        window.open(item.link, "_blank", "noreferrer");
      });
      row.addEventListener("keydown", (e) => {
        if (e.key === "Enter") window.open(item.link, "_blank", "noreferrer");
      });
    }
    focusEl.appendChild(row);
  });
}

function renderTodo(items) {
  todoEl.innerHTML = "";
  if (!items || items.length === 0) {
    todoStatusEl.textContent = "Aucun stage a faire.";
    return;
  }
  todoStatusEl.textContent = "";
  items.forEach((item) => {
    const row = document.createElement("div");
    row.className = "event-chip";
    const title = document.createElement("div");
    title.className = "event-title";
    title.textContent = normalizeText(
      [item.company, item.title].filter(Boolean).join(" - ") || "Sans titre"
    );
    row.appendChild(title);
    row.tabIndex = 0;
    if (item.url) {
      row.addEventListener("click", () => {
        window.open(item.url, "_blank", "noreferrer");
      });
      row.addEventListener("keydown", (e) => {
        if (e.key === "Enter") window.open(item.url, "_blank", "noreferrer");
      });
    }
    todoEl.appendChild(row);
  });
}

function renderNews(items) {
  newsEl.innerHTML = "";
  if (!items || items.length === 0) {
    newsStatusEl.textContent = "Aucune news chargee.";
    return;
  }
  newsStatusEl.textContent = "";
  items.slice(0, 5).forEach((item) => {
    const row = document.createElement("div");
    row.className = "event-chip";
    const title = document.createElement("div");
    title.className = "event-title";
    title.textContent = normalizeText(item.title || "Article");
    row.appendChild(title);
    row.tabIndex = 0;
    if (item.link) {
      row.addEventListener("click", () => {
        window.open(item.link, "_blank", "noreferrer");
      });
      row.addEventListener("keydown", (e) => {
        if (e.key === "Enter") window.open(item.link, "_blank", "noreferrer");
      });
    }
    newsEl.appendChild(row);
  });
}

function renderTimeline(items) {
  if (!timelineListEl) return;
  timelineListEl.innerHTML = "";
  if (!items || items.length === 0) {
    if (timelineStatusEl) timelineStatusEl.textContent = "Aucun élément pour aujourd'hui.";
    return;
  }
  if (timelineStatusEl) timelineStatusEl.textContent = "";
  items.forEach((item) => {
    const row = document.createElement("div");
    row.className = "timeline-item";
    const dot = document.createElement("div");
    dot.className = "timeline-dot";
    dot.style.background = item.color || "";
    row.appendChild(dot);
    const content = document.createElement("div");
    const title = document.createElement("div");
    title.className = "timeline-title";
    title.textContent = item.title || "Élément";
    const meta = document.createElement("div");
    meta.className = "timeline-meta";
    meta.textContent = item.meta || "";
    content.appendChild(title);
    if (meta.textContent) content.appendChild(meta);
    row.appendChild(content);
    if (item.link) {
      row.addEventListener("click", () => window.open(item.link, "_blank", "noreferrer"));
      row.addEventListener("keydown", (e) => {
        if (e.key === "Enter") window.open(item.link, "_blank", "noreferrer");
      });
      row.tabIndex = 0;
    }
    timelineListEl.appendChild(row);
  });
}

function loadEvents() {
  const now = new Date();
  const timeMin = now.toISOString();
  const timeMax = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000).toISOString();
  eventsStatusEl.textContent = "Chargement...";

  chrome.storage.local.get(["gcalSelectedCalendars"], (data) => {
    const ids = Array.isArray(data.gcalSelectedCalendars) ? data.gcalSelectedCalendars : [];
    chrome.runtime.sendMessage(
      { type: "GCAL_LOAD_EVENTS", payload: { timeMin, timeMax, calendarIds: ids } },
      (res) => {
        if (chrome.runtime.lastError) {
          eventsStatusEl.textContent = `Erreur: ${chrome.runtime.lastError.message}`;
          return;
        }
        if (!res?.ok) {
          const err = res?.error || "inconnue";
          eventsStatusEl.textContent =
            err === "AUTH_REQUIRED"
              ? "Non connecte. Connecte Google dans Options."
              : `Erreur: ${err}`;
          return;
        }
        renderEvents((res.events || []).slice(0, 3));
      }
    );
  });
}

function loadFocus() {
  focusStatusEl.textContent = "Chargement...";
  const now = new Date();
  const timeMin = now.toISOString();
  const timeMax = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();

  chrome.storage.local.get(["gcalSelectedCalendars"], (data) => {
    const ids = Array.isArray(data.gcalSelectedCalendars) ? data.gcalSelectedCalendars : [];
    chrome.runtime.sendMessage(
      { type: "GCAL_LOAD_EVENTS", payload: { timeMin, timeMax, calendarIds: ids } },
      (res) => {
        if (!res?.ok) {
          focusStatusEl.textContent = "Non connecte ou aucune donnee.";
          return;
        }
        focusData.events = (res.events || [])
          .filter((ev) => Array.isArray(ev.tags) && ev.tags.includes("important"))
          .slice(0, 3)
          .map((ev) => ({
            title: normalizeText(ev.summary || "Evenement important"),
            meta: formatEventTime(ev),
            link: ev.meetingLink || ev.htmlLink || "",
            linkLabel: ev.meetingLink ? "Rejoindre" : "Ouvrir",
          }));
        renderFocus([...focusData.events, ...focusData.todos]);
      }
    );
  });

  chrome.runtime.sendMessage({ type: "GET_TODO_STAGES" }, (res) => {
    if (!res?.ok) return;
    focusData.todos = (res.items || [])
      .slice(0, 2)
      .map((item) => ({
        title: normalizeText([item.company, item.title].filter(Boolean).join(" - ")),
        meta: "Stage a faire",
        link: item.url || "",
        linkLabel: "Ouvrir",
      }));
    renderFocus([...focusData.events, ...focusData.todos]);
  });
}

function loadTimeline() {
  if (timelineStatusEl) timelineStatusEl.textContent = "Chargement...";
  const now = new Date();
  const timeMin = now.toISOString();
  const timeMax = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();

  chrome.storage.local.get(["gcalSelectedCalendars"], (data) => {
    const ids = Array.isArray(data.gcalSelectedCalendars) ? data.gcalSelectedCalendars : [];
    chrome.runtime.sendMessage(
      { type: "GCAL_LOAD_EVENTS", payload: { timeMin, timeMax, calendarIds: ids } },
      (res) => {
        const items = [];
        if (res?.ok) {
          (res.events || [])
            .filter((ev) => Array.isArray(ev.tags) && ev.tags.includes("important"))
            .forEach((ev) => {
              items.push({
                title: normalizeText(ev.summary || "Événement important"),
                meta: formatEventTime(ev),
                time: ev.start ? new Date(ev.start).getTime() : 0,
                link: ev.meetingLink || ev.htmlLink || "",
                color: "#38bdf8",
              });
            });
        }

        chrome.runtime.sendMessage({ type: "GET_TODO_STAGES" }, (todoRes) => {
          if (todoRes?.ok) {
            (todoRes.items || []).slice(0, 5).forEach((item) => {
              items.push({
                title: normalizeText([item.company, item.title].filter(Boolean).join(" - ")),
                meta: "Stage à faire",
                time: now.getTime() + 6 * 60 * 60 * 1000,
                link: item.url || "",
                color: "#22c55e",
              });
            });
          }

          chrome.runtime.sendMessage({ type: "GET_STAGE_DEADLINES" }, (deadRes) => {
            if (deadRes?.ok) {
              (deadRes.items || []).slice(0, 6).forEach((item) => {
                const t = item.closeDate ? new Date(item.closeDate).getTime() : 0;
                items.push({
                  title: normalizeText([item.company, item.title].filter(Boolean).join(" - ")),
                  meta: `Deadline: ${item.closeDate || ""}`,
                  time: t,
                  link: item.url || "",
                  color: "#f59e0b",
                });
              });
            }

            items.sort((a, b) => (a.time || 0) - (b.time || 0));
            renderTimeline(items);
          });
        });
      }
    );
  });
}

function loadTodo() {
  todoStatusEl.textContent = "Chargement...";
  chrome.runtime.sendMessage({ type: "GET_TODO_STAGES" }, (res) => {
    if (chrome.runtime.lastError) {
      todoStatusEl.textContent = `Erreur: ${chrome.runtime.lastError.message}`;
      return;
    }
    if (!res?.ok) {
      todoStatusEl.textContent = `Erreur: ${res?.error || "inconnue"}`;
      return;
    }
    renderTodo(res.items || []);
  });
}

function loadNews() {
  newsStatusEl.textContent = "Chargement...";
  chrome.runtime.sendMessage({ type: "GET_YAHOO_NEWS" }, (res) => {
    if (chrome.runtime.lastError) {
      newsStatusEl.textContent = `Erreur: ${chrome.runtime.lastError.message}`;
      return;
    }
    if (!res?.ok) {
      newsStatusEl.textContent = `Erreur: ${res?.error || "inconnue"}`;
      return;
    }
    renderNews(res.data?.items || []);
  });
}

chrome.storage.local.get(["focusModeEnabled", "pomodoroWork", "pomodoroBreak"], (data) => {
  pomodoroWorkMinutes = Number.parseInt(data.pomodoroWork || "25", 10);
  pomodoroBreakMinutes = Number.parseInt(data.pomodoroBreak || "5", 10);
  if (focusSwitchEl) focusSwitchEl.checked = data.focusModeEnabled === true;
  resetPomodoro();
});

if (focusSwitchEl) {
  focusSwitchEl.addEventListener("change", async () => {
    const enabled = !!focusSwitchEl.checked;
    await chrome.storage.local.set({ focusModeEnabled: enabled, urlBlockerEnabled: enabled });
    chrome.runtime.sendMessage({ type: "URL_BLOCKER_RECHECK" }, () => {});
  });
}

if (pomodoroStartBtn) pomodoroStartBtn.addEventListener("click", startPomodoro);
if (pomodoroPauseBtn) pomodoroPauseBtn.addEventListener("click", pausePomodoro);
if (pomodoroResetBtn) pomodoroResetBtn.addEventListener("click", resetPomodoro);

applyWidgetPreferences();
loadEvents();
loadFocus();
loadTodo();
loadNews();
loadTimeline();
