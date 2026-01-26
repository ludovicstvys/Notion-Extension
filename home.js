const eventsStatusEl = document.getElementById("home-events-status");
const eventsEl = document.getElementById("home-events");
const todoStatusEl = document.getElementById("home-todo-status");
const todoEl = document.getElementById("home-todo");
const newsStatusEl = document.getElementById("home-news-status");
const newsEl = document.getElementById("home-news");
const focusStatusEl = document.getElementById("focus-status");
const focusEl = document.getElementById("focus-list");
const focusData = { events: [], todos: [] };

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

function makeEventChip(ev) {
  const chip = document.createElement("div");
  chip.className = "event-chip";

  const title = document.createElement("div");
  title.className = "event-title";
  title.textContent = normalizeText(ev.summary || "Evenement");

  const meta = document.createElement("div");
  meta.className = "event-meta";
  meta.textContent = formatEventTime(ev);

  chip.appendChild(title);
  if (meta.textContent) chip.appendChild(meta);

  if (ev.meetingLink) {
    const link = document.createElement("a");
    link.href = ev.meetingLink;
    link.target = "_blank";
    link.rel = "noreferrer";
    link.textContent = "Rejoindre";
    chip.appendChild(link);
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
    if (item.link) {
      const link = document.createElement("a");
      link.href = item.link;
      link.target = "_blank";
      link.rel = "noreferrer";
      link.textContent = item.linkLabel || "Ouvrir";
      row.appendChild(link);
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
    if (item.url) {
      const link = document.createElement("a");
      link.href = item.url;
      link.target = "_blank";
      link.rel = "noreferrer";
      link.textContent = "Ouvrir";
      row.appendChild(link);
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
    if (item.link) {
      const link = document.createElement("a");
      link.href = item.link;
      link.target = "_blank";
      link.rel = "noreferrer";
      link.textContent = "Lire";
      row.appendChild(link);
    }
    newsEl.appendChild(row);
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

loadEvents();
loadFocus();
loadTodo();
loadNews();
