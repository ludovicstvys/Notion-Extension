const eventsStatusEl = document.getElementById("home-events-status");
const eventsEl = document.getElementById("home-events");
const newsStatusEl = document.getElementById("home-news-status");
const newsEl = document.getElementById("home-news");
const addBtn = document.getElementById("home-add");
const appliedCb = document.getElementById("home-applied");
const addStatusEl = document.getElementById("home-add-status");
const queueStatusEl = document.getElementById("home-queue-status");
const queueListEl = document.getElementById("home-queue-list");
const queueCountEl = document.getElementById("home-queue-count");
const marketsStatusEl = document.getElementById("markets-status");
const marketsListEl = document.getElementById("markets-list");
const todoNotionStatusEl = document.getElementById("todo-notion-status");
const todoNotionListEl = document.getElementById("todo-notion-list");
const todoTaskEl = document.getElementById("todo-task");
const todoDueEl = document.getElementById("todo-due");
const todoNotesEl = document.getElementById("todo-notes");
const todoAddBtn = document.getElementById("todo-add");
const todoToggleBtn = document.getElementById("todo-toggle");
const todoFormEl = document.querySelector(".todo-form");
const toastStackEl = document.getElementById("toast-stack");
const pomodoroTimerEl = document.getElementById("pomodoro-timer");
const pomodoroStartBtn = document.getElementById("pomodoro-start");
const pomodoroPauseBtn = document.getElementById("pomodoro-pause");
const pomodoroResumeBtn = document.getElementById("pomodoro-resume");
const pomodoroResetBtn = document.getElementById("pomodoro-reset");
const widgetSections = Array.from(document.querySelectorAll("[data-widget]"));
let extracted = null;
let notionQueueInterval = null;
let pomodoroInterval = null;
let pomodoroMode = "work";
let pomodoroRemaining = 25 * 60;
let pomodoroWorkMinutes = 25;
let pomodoroBreakMinutes = 5;

function normalizeText(input) {
  const text = (input ?? "").toString();
  return text.normalize("NFC").trim();
}

function queueLabelFromPayload(payload) {
  const company = normalizeText(payload?.company);
  const title = normalizeText(payload?.title);
  return `${title || "Poste inconnu"} - ${company || "Entreprise inconnue"}`;
}

function showToast(message, kind = "success") {
  if (!toastStackEl) return;
  const toast = document.createElement("div");
  toast.className = `toast ${kind === "queue" ? "queue" : "success"}`;
  toast.textContent = message;
  toastStackEl.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add("visible"));
  window.setTimeout(() => {
    toast.classList.remove("visible");
    window.setTimeout(() => toast.remove(), 220);
  }, 2800);
}

function handleNotionQueueEvent(msg) {
  if (msg?.type !== "NOTION_QUEUE_EVENT") return;
  const eventName = normalizeText(msg?.payload?.event || "");
  const label = normalizeText(msg?.payload?.label || "Stage");
  if (eventName !== "notion_saved") return;

  const mode = normalizeText(msg?.payload?.mode || "created");
  const prefix = mode === "updated" ? "Stage mis a jour dans Notion" : "Stage ajoute dans Notion";
  showToast(`${prefix}: ${label}`, "success");
  loadNotionQueue();
}

chrome.runtime.onMessage.addListener((msg) => {
  handleNotionQueueEvent(msg);
});

function formatQueueDelay(waitMs) {
  const totalSec = Math.max(0, Math.ceil(Number(waitMs || 0) / 1000));
  if (totalSec < 60) return `${totalSec}s`;
  const totalMin = Math.ceil(totalSec / 60);
  return `${totalMin}min`;
}

function renderNotionQueue(items, processing) {
  if (!queueStatusEl || !queueListEl || !queueCountEl) return;

  const list = Array.isArray(items) ? items : [];
  queueCountEl.textContent = `${list.length}`;
  queueListEl.innerHTML = "";

  if (!list.length) {
    queueStatusEl.textContent = processing ? "Upload en cours..." : "Aucun stage en attente.";
    const empty = document.createElement("div");
    empty.className = "queue-item";
    const title = document.createElement("div");
    title.className = "queue-item-title";
    title.textContent = "Queue vide";
    empty.appendChild(title);
    queueListEl.appendChild(empty);
    return;
  }

  queueStatusEl.textContent = processing
    ? `${list.length} stage(s) en queue (upload en cours).`
    : `${list.length} stage(s) en queue.`;

  list.forEach((item, index) => {
    const row = document.createElement("div");
    row.className = "queue-item";

    const title = document.createElement("div");
    title.className = "queue-item-title";
    title.textContent = normalizeText(item?.label || "Stage");

    const meta = document.createElement("div");
    meta.className = "queue-item-meta";

    let state = "En attente";
    if (item?.state === "retry_wait") {
      state = `Retry dans ${formatQueueDelay(item.waitMs)}`;
    } else if (item?.state === "uploading" || (index === 0 && processing)) {
      state = "Upload en cours";
    }
    const parts = [state];
    if (Number(item?.attempts || 0) > 0) {
      parts.push(`retry: ${Number(item.attempts)}`);
    }
    meta.textContent = parts.join(" - ");

    row.appendChild(title);
    row.appendChild(meta);
    queueListEl.appendChild(row);
  });
}

function loadNotionQueue() {
  if (!queueStatusEl || !queueListEl || !queueCountEl) return;
  chrome.runtime.sendMessage({ type: "OFFLINE_QUEUE_DETAILS" }, (res) => {
    if (chrome.runtime.lastError) {
      queueStatusEl.textContent = `Erreur: ${chrome.runtime.lastError.message}`;
      return;
    }
    if (!res?.ok) {
      queueStatusEl.textContent = `Erreur: ${res?.error || "inconnue"}`;
      return;
    }
    renderNotionQueue(res.items || [], !!res.processing);
  });
}

function startNotionQueueRefresh() {
  loadNotionQueue();
  if (notionQueueInterval) {
    clearInterval(notionQueueInterval);
  }
  notionQueueInterval = setInterval(loadNotionQueue, 3000);
}

function formatEventTime(ev) {
  const start = ev.start ? new Date(ev.start) : null;
  if (!start) return "";
  if (ev.start.length === 10) return start.toLocaleDateString();
  return start.toLocaleString();
}

function formatDateDisplay(input) {
  if (!input) return "";
  const d = new Date(input);
  if (Number.isNaN(d.getTime())) return input;
  return d.toLocaleDateString("fr-FR", {
    weekday: "short",
    day: "2-digit",
    month: "short",
  });
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

function setFocusButtons(state) {
  if (!pomodoroStartBtn || !pomodoroPauseBtn || !pomodoroResumeBtn || !pomodoroResetBtn) return;
  if (state === "running") {
    pomodoroStartBtn.classList.add("hidden");
    pomodoroPauseBtn.classList.remove("hidden");
    pomodoroResumeBtn.classList.add("hidden");
    pomodoroResetBtn.classList.add("hidden");
    return;
  }
  if (state === "paused") {
    pomodoroStartBtn.classList.add("hidden");
    pomodoroPauseBtn.classList.add("hidden");
    pomodoroResumeBtn.classList.remove("hidden");
    pomodoroResetBtn.classList.remove("hidden");
    return;
  }
  pomodoroStartBtn.classList.remove("hidden");
  pomodoroPauseBtn.classList.add("hidden");
  pomodoroResumeBtn.classList.add("hidden");
  pomodoroResetBtn.classList.add("hidden");
}

function applyWidgetPreferences() {
  chrome.storage.local.get(["dashboardWidgets"], (data) => {
    const prefs = data.dashboardWidgets || {};
    const keys = Object.keys(prefs);
    const allFalse = keys.length > 0 && keys.every((k) => prefs[k] === false);
    if (keys.length === 0 || allFalse) {
      const defaults = {
        events: true,
        add: true,
        news: true,
        markets: true,
        todoNotion: true,
        focusMode: true,
      };
      chrome.storage.local.set({ dashboardWidgets: defaults });
      widgetSections.forEach((section) => {
        section.style.display = "";
      });
      return;
    }
    const getPref = (key) => {
      if (key === "markets") {
        if (prefs.markets === false || prefs.timeline === false) return false;
        if (prefs.markets === true || prefs.timeline === true) return true;
        return undefined;
      }
      if (key === "focus-mode") {
        if (prefs.focus === false || prefs.focusMode === false) return false;
        if (prefs.focus === true || prefs.focusMode === true) return true;
        return undefined;
      }
      if (key === "todo-notion") return prefs.todoNotion;
      return prefs[key];
    };
    widgetSections.forEach((section) => {
      const key = section.getAttribute("data-widget");
      if (!key) return;
      const prefValue = getPref(key);
      if (prefValue === false) {
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
    if (addStatusEl) addStatusEl.textContent = "Ajout a la queue Notion...";

    const payload = { ...extracted, applied: !!appliedCb?.checked };
    chrome.runtime.sendMessage({ type: "UPSERT_NOTION", payload }, (res) => {
      if (chrome.runtime.lastError) {
        if (addStatusEl) {
          addStatusEl.textContent = `Erreur extension: ${chrome.runtime.lastError.message}`;
        }
        return;
      }

      if (res?.ok) {
        if (addStatusEl) addStatusEl.textContent = "";
        showToast(`Stage ajoute a la queue: ${queueLabelFromPayload(payload)}`, "queue");
        loadNotionQueue();
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

// Stage todo list removed from dashboard.

function renderNews(items) {
  newsEl.innerHTML = "";
  if (!items || items.length === 0) {
    newsStatusEl.textContent = "Aucune news chargee.";
    return;
  }
  newsStatusEl.textContent = "";
  items.forEach((item) => {
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

function openTodoDetail(item) {
  const todo = item || {};
  const id = normalizeText(todo.id || "");
  const params = new URLSearchParams();
  params.set("id", id);
  params.set("task", normalizeText(todo.task || ""));
  params.set("status", normalizeText(todo.status || ""));
  params.set("dueDate", normalizeText(todo.dueDate || ""));
  params.set("addedDate", normalizeText(todo.addedDate || todo.createdAt || ""));
  params.set("priority", normalizeText(todo.priority || ""));
  params.set("stageId", normalizeText(todo.stageId || ""));
  params.set("stageLabel", normalizeText(todo.stageLabel || ""));
  params.set("stageLink", normalizeText(todo.stageLink || ""));
  params.set("notes", normalizeText(todo.notes || ""));

  const fallback = {
    id,
    task: normalizeText(todo.task || ""),
    status: normalizeText(todo.status || ""),
    dueDate: normalizeText(todo.dueDate || ""),
    addedDate: normalizeText(todo.addedDate || todo.createdAt || ""),
    priority: normalizeText(todo.priority || ""),
    stageId: normalizeText(todo.stageId || ""),
    stageLabel: normalizeText(todo.stageLabel || ""),
    stageLink: normalizeText(todo.stageLink || ""),
    notes: normalizeText(todo.notes || ""),
  };

  const openPage = () => {
    window.open(`todo-detail.html?${params.toString()}`, "_blank", "noreferrer");
  };

  if (chrome?.storage?.local) {
    chrome.storage.local.set({ todoDetailId: id, todoDetailFallback: fallback }, openPage);
    return;
  }
  openPage();
}

function openStageDetailFromTodo(item) {
  const todo = item || {};
  const stageId = normalizeText(todo.stageId || "");
  const stageLabel = normalizeText(todo.stageLabel || "");
  const stageLink = normalizeText(todo.stageLink || "");

  if (stageId) {
    const query = new URLSearchParams();
    query.set("id", stageId);
    query.set("title", stageLabel);
    query.set("link", stageLink);

    const fallback = {
      id: stageId,
      title: stageLabel,
      url: stageLink,
    };

    const openPage = () => {
      window.open(`stage-detail.html?${query.toString()}`, "_blank", "noreferrer");
    };

    if (chrome?.storage?.local) {
      chrome.storage.local.set({ stageDetailId: stageId, stageDetailFallback: fallback }, openPage);
      return;
    }
    openPage();
    return;
  }

  if (stageLink) {
    window.open(stageLink, "_blank", "noreferrer");
  }
}

function renderNotionTodos(items) {
  if (!todoNotionListEl) return;
  todoNotionListEl.innerHTML = "";
  const sorted = (items || [])
    .slice()
    .sort((a, b) => new Date(a.dueDate || 0) - new Date(b.dueDate || 0));
  if (!sorted || sorted.length === 0) {
    if (todoNotionStatusEl) todoNotionStatusEl.textContent = "Aucune tâche.";
    return;
  }
  if (todoNotionStatusEl) todoNotionStatusEl.textContent = "";

  sorted.forEach((item) => {
    const row = document.createElement("div");
    row.className = "event-chip";
    const title = document.createElement("div");
    title.className = "event-title";
    title.textContent = normalizeText(item.task || "Tâche");
    row.appendChild(title);
    if (item.dueDate) {
      const due = new Date(item.dueDate);
      const days = Math.ceil((due.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
      const badge = document.createElement("div");
      badge.className = "due-badge";
      if (days <= 2) badge.classList.add("soon");
      else if (days <= 7) badge.classList.add("mid");
      badge.textContent = `Deadline: ${formatDateDisplay(item.dueDate)}`;
      row.appendChild(badge);
    } else if (item.status) {
      const meta = document.createElement("div");
      meta.className = "event-meta";
      meta.textContent = item.status || "";
      row.appendChild(meta);
    }

    if (item.stageId || item.stageLabel || item.stageLink) {
      const stageMeta = document.createElement("div");
      stageMeta.className = "event-meta";
      stageMeta.textContent = item.stageLabel ? `Stage: ${item.stageLabel}` : "Stage lie";
      row.appendChild(stageMeta);
    }

    row.tabIndex = 0;
    row.setAttribute("role", "button");
    row.addEventListener("click", () => openTodoDetail(item));
    row.addEventListener("keydown", (e) => {
      if (e.target !== row) return;
      if (e.key !== "Enter" && e.key !== " ") return;
      e.preventDefault();
      openTodoDetail(item);
    });

    const doneBtn = document.createElement("button");
    doneBtn.className = "btn secondary";
    doneBtn.style.marginTop = "6px";
    doneBtn.textContent = "Marquer Done";
    doneBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      doneBtn.disabled = true;
      chrome.runtime.sendMessage(
        { type: "UPDATE_TODO_NOTION", payload: { id: item.id, status: "Done" } },
        (res) => {
          doneBtn.disabled = false;
          if (chrome.runtime.lastError) {
            if (todoNotionStatusEl) {
              todoNotionStatusEl.textContent = `Erreur: ${chrome.runtime.lastError.message}`;
            }
            return;
          }
          if (!res?.ok) {
            const err = normalizeText(res?.error || "inconnue");
            if (/expected to be status|expected to be select|message inconnu\./i.test(err)) {
              if (todoNotionStatusEl) {
                todoNotionStatusEl.textContent =
                  "Erreur de version extension. Recharge l'extension dans chrome://extensions puis reessaie.";
              }
              return;
            }
            if (todoNotionStatusEl) {
              todoNotionStatusEl.textContent = `Erreur: ${err}`;
            }
            return;
          }
          if (todoNotionStatusEl) todoNotionStatusEl.textContent = "";
          loadNotionTodos();
        }
      );
    });
    row.appendChild(doneBtn);

    if (item.stageId || item.stageLink) {
      const stageBtn = document.createElement("button");
      stageBtn.className = "btn secondary";
      stageBtn.style.marginTop = "6px";
      stageBtn.textContent = "Ouvrir stage";
      stageBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        openStageDetailFromTodo(item);
      });
      row.appendChild(stageBtn);
    }

    todoNotionListEl.appendChild(row);
  });
}


const HOME_MARKET_ITEMS = [
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

function formatDelta(value) {
  if (!Number.isFinite(value)) return "N/D";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}%`;
}

function renderMarketsList(bySymbol) {
  if (!marketsListEl) return;
  marketsListEl.innerHTML = "";
  const items = HOME_MARKET_ITEMS.map((item) => {
    const quote = bySymbol[item.symbol] || {};
    return {
      ...item,
      price: quote.price,
      changePercent: quote.changePercent,
    };
  });
  chrome.storage?.local?.set?.({
    marketsCache: { at: Date.now(), items },
  });
  if (items.length === 0) {
    if (marketsStatusEl) marketsStatusEl.textContent = "Marches indisponibles.";
    return;
  }
  if (marketsStatusEl) marketsStatusEl.textContent = "";
  items.forEach((item) => {
    const row = document.createElement("div");
    row.className = "market-row";
    const left = document.createElement("div");
    const title = document.createElement("div");
    title.className = "market-title";
    title.textContent = item.label;
    const meta = document.createElement("div");
    meta.className = "market-meta";
    meta.textContent = formatWithDigits(item.price, item.digits);
    left.appendChild(title);
    left.appendChild(meta);

    const delta = document.createElement("div");
    delta.className = "market-delta";
    const change = item.changePercent;
    delta.textContent = formatDelta(change);
    if (Number.isFinite(change)) {
      if (change > 0) delta.classList.add("up");
      else if (change < 0) delta.classList.add("down");
      else delta.classList.add("flat");
    } else {
      delta.classList.add("flat");
    }

    row.appendChild(left);
    row.appendChild(delta);
    marketsListEl.appendChild(row);
  });
}

function loadMarketsList() {
  if (marketsStatusEl) marketsStatusEl.textContent = "Chargement...";
  chrome.storage?.local?.get?.(["marketsCache"], (cached) => {
    const cache = cached?.marketsCache;
    if (cache?.items?.length) {
      renderMarketsList(
        cache.items.reduce((acc, item) => {
          acc[item.symbol] = { price: item.price, changePercent: item.changePercent };
          return acc;
        }, {})
      );
    }
  });
  const yahooSymbols = Array.from(
    new Set(HOME_MARKET_ITEMS.map((i) => i.symbol).filter((s) => s !== "^FR10Y"))
  );
  chrome.runtime.sendMessage(
    { type: "GET_YAHOO_QUOTES", payload: { symbols: yahooSymbols, force: false } },
    (res) => {
      if (!res?.ok) {
        if (marketsStatusEl) marketsStatusEl.textContent = "Marches indisponibles.";
        return;
      }
      const bySymbol = res.data?.bySymbol || {};
      chrome.runtime.sendMessage(
        { type: "GET_ECB_FR10Y", payload: { force: true } },
        (ecbRes) => {
          if (ecbRes?.ok && Number.isFinite(ecbRes.data?.value)) {
            bySymbol["^FR10Y"] = { symbol: "^FR10Y", price: ecbRes.data.value };
          }
          renderMarketsList(bySymbol);
        }
      );
    }
  );
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

function loadNotionTodos() {
  if (todoNotionStatusEl) todoNotionStatusEl.textContent = "Chargement...";
  chrome.runtime.sendMessage({ type: "LIST_TODO_NOTION" }, (res) => {
    if (chrome.runtime.lastError) {
      if (todoNotionStatusEl) {
        todoNotionStatusEl.textContent = `Erreur: ${chrome.runtime.lastError.message}`;
      }
      renderNotionTodos([]);
      return;
    }
    if (!res?.ok) {
      if (todoNotionStatusEl) {
        todoNotionStatusEl.textContent = `Erreur: ${res?.error || "inconnue"}`;
      }
      renderNotionTodos([]);
      return;
    }
    renderNotionTodos(res.items || []);
  });
}

chrome.storage.local.get(["pomodoroWork", "pomodoroBreak"], (data) => {
  pomodoroWorkMinutes = Number.parseInt(data.pomodoroWork || "25", 10);
  pomodoroBreakMinutes = Number.parseInt(data.pomodoroBreak || "5", 10);
  resetPomodoro();
  setFocusButtons("idle");
});

if (pomodoroStartBtn) {
  pomodoroStartBtn.addEventListener("click", async () => {
    await chrome.storage.local.set({ focusModeEnabled: true, urlBlockerEnabled: true });
    chrome.runtime.sendMessage({ type: "URL_BLOCKER_RECHECK" }, () => {});
    startPomodoro();
    setFocusButtons("running");
  });
}

if (pomodoroPauseBtn) {
  pomodoroPauseBtn.addEventListener("click", () => {
    pausePomodoro();
    setFocusButtons("paused");
  });
}

if (pomodoroResumeBtn) {
  pomodoroResumeBtn.addEventListener("click", () => {
    startPomodoro();
    setFocusButtons("running");
  });
}

if (pomodoroResetBtn) {
  pomodoroResetBtn.addEventListener("click", async () => {
    pausePomodoro();
    resetPomodoro();
    await chrome.storage.local.set({ focusModeEnabled: false, urlBlockerEnabled: false });
    chrome.runtime.sendMessage({ type: "URL_BLOCKER_RECHECK" }, () => {});
    setFocusButtons("idle");
  });
}

if (todoAddBtn) {
  todoAddBtn.addEventListener("click", () => {
    const task = normalizeText(todoTaskEl?.value || "");
    if (!task) return;
    const payload = {
      task,
      dueDate: todoDueEl?.value || "",
      notes: normalizeText(todoNotesEl?.value || ""),
      status: "Not Started",
    };
    chrome.runtime.sendMessage({ type: "CREATE_TODO_NOTION", payload }, (res) => {
      if (todoNotionStatusEl) {
        todoNotionStatusEl.textContent = res?.ok ? "Tâche créée." : `Erreur: ${res?.error || "inconnue"}`;
      }
      if (res?.ok) {
        if (todoTaskEl) todoTaskEl.value = "";
        if (todoDueEl) todoDueEl.value = "";
        if (todoNotesEl) todoNotesEl.value = "";
        loadNotionTodos();
      }
    });
  });
}

if (todoToggleBtn && todoFormEl) {
  todoFormEl.classList.add("hidden");
  todoToggleBtn.addEventListener("click", () => {
    todoFormEl.classList.toggle("hidden");
  });
}

applyWidgetPreferences();
loadEvents();
loadNews();
loadMarketsList();
loadNotionTodos();
startNotionQueueRefresh();

window.addEventListener("beforeunload", () => {
  if (notionQueueInterval) {
    clearInterval(notionQueueInterval);
    notionQueueInterval = null;
  }
});




