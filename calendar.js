const calendarListEl = document.getElementById("calendar-list");
const notifyListEl = document.getElementById("notify-list");
const calendarStatusEl = document.getElementById("calendar-status");
const eventsEl = document.getElementById("calendar-view");
const eventsStatusEl = document.getElementById("events-status");
const nextEventsEl = document.getElementById("next-events");
const nextStatusEl = document.getElementById("next-status");
const dateEl = document.getElementById("date");
const searchEl = document.getElementById("search");
const refreshBtn = document.getElementById("refresh");
const prevBtn = document.getElementById("prev");
const nextBtn = document.getElementById("next");
const todayBtn = document.getElementById("today");
const tabs = Array.from(document.querySelectorAll(".tab"));
const filterBtns = Array.from(document.querySelectorAll(".filter"));

let calendars = [];
let selectedIds = [];
let viewMode = "day";
let meetingFilter = "all";
let notifyIds = [];

function todayLocalDateInput() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function normalizeText(input) {
  const text = (input ?? "").toString();
  return text.normalize("NFC").trim();
}

function parseDateInput(value) {
  if (!value) return new Date();
  const [y, m, d] = value.split("-").map((v) => Number.parseInt(v, 10));
  return new Date(y, m - 1, d);
}

function rangeForView(date, mode) {
  const start = new Date(date);
  const end = new Date(date);

  if (mode === "week") {
    const day = start.getDay();
    const diff = (day + 6) % 7; // monday start
    start.setDate(start.getDate() - diff);
    end.setDate(start.getDate() + 7);
  } else if (mode === "month") {
    start.setDate(1);
    end.setMonth(start.getMonth() + 1, 1);
  } else {
    end.setDate(start.getDate() + 1);
  }

  return { timeMin: start.toISOString(), timeMax: end.toISOString() };
}

function setDateInput(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  dateEl.value = `${y}-${m}-${day}`;
}

function shiftDate(direction) {
  const current = parseDateInput(dateEl.value);
  const next = new Date(current);

  if (viewMode === "month") {
    next.setMonth(current.getMonth() + direction, 1);
  } else if (viewMode === "week") {
    next.setDate(current.getDate() + 7 * direction);
  } else {
    next.setDate(current.getDate() + direction);
  }

  setDateInput(next);
  loadEvents();
}

function startOfDay(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function dateKey(date) {
  const d = new Date(date);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function getEventDateKey(ev) {
  if (ev.start && ev.start.length === 10) return ev.start;
  return dateKey(ev.start);
}

function weekStart(date) {
  const d = startOfDay(date);
  const day = d.getDay();
  const diff = (day + 6) % 7;
  d.setDate(d.getDate() - diff);
  return d;
}

function monthGridStart(date) {
  const first = new Date(date.getFullYear(), date.getMonth(), 1);
  return weekStart(first);
}

function renderCalendars(items) {
  calendarListEl.innerHTML = "";
  if (!items || items.length === 0) {
    calendarStatusEl.textContent = "Aucun calendrier trouve.";
    return;
  }

  calendarStatusEl.textContent = "";
  items.forEach((cal) => {
    const row = document.createElement("label");
    row.className = "calendar-item";

    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.checked = selectedIds.includes(cal.id);
    cb.addEventListener("change", () => {
      if (cb.checked) {
        selectedIds.push(cal.id);
      } else {
        selectedIds = selectedIds.filter((id) => id !== cal.id);
      }
      chrome.storage.local.set({ gcalSelectedCalendars: selectedIds });
      loadEvents();
      loadNextEvents();
    });

    const dot = document.createElement("span");
    dot.className = "calendar-dot";
    dot.style.background = cal.backgroundColor || "#94a3b8";

    const label = document.createElement("span");
    label.textContent = normalizeText(cal.summary || cal.id);

    row.appendChild(cb);
    row.appendChild(dot);
    row.appendChild(label);
    calendarListEl.appendChild(row);
  });
}

function renderNotifyCalendars(items) {
  if (!notifyListEl) return;
  notifyListEl.innerHTML = "";
  items.forEach((cal) => {
    const row = document.createElement("label");
    row.className = "calendar-item";

    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.checked = notifyIds.includes(cal.id);
    cb.addEventListener("change", () => {
      if (cb.checked) {
        notifyIds.push(cal.id);
      } else {
        notifyIds = notifyIds.filter((id) => id !== cal.id);
      }
      chrome.runtime.sendMessage({
        type: "GCAL_SET_NOTIFY_PREFS",
        payload: { ids: notifyIds },
      });
    });

    const dot = document.createElement("span");
    dot.className = "calendar-dot";
    dot.style.background = cal.backgroundColor || "#94a3b8";

    const label = document.createElement("span");
    label.textContent = normalizeText(cal.summary || cal.id);

    row.appendChild(cb);
    row.appendChild(dot);
    row.appendChild(label);
    notifyListEl.appendChild(row);
  });
}

function formatEventTime(ev) {
  const start = ev.start ? new Date(ev.start) : null;
  const end = ev.end ? new Date(ev.end) : null;
  if (!start) return "";
  const opts = { hour: "2-digit", minute: "2-digit" };
  if (ev.start.length === 10) return start.toLocaleDateString();
  const startStr = start.toLocaleTimeString([], opts);
  const endStr = end ? end.toLocaleTimeString([], opts) : "";
  return endStr ? `${startStr} - ${endStr}` : startStr;
}

function getCalendarColor(calendarId) {
  const cal = calendars.find((c) => c.id === calendarId);
  return cal?.backgroundColor || "#2563eb";
}

function getMeetingType(link) {
  const url = String(link || "");
  if (/meet\.google\.com/i.test(url)) return "meet";
  if (/zoom\.us\/j\//i.test(url)) return "zoom";
  if (/teams\.microsoft\.com\/l\/meetup-join/i.test(url)) return "teams";
  return "other";
}

function passesFilters(ev) {
  const q = normalizeText(searchEl?.value || "").toLowerCase();
  if (q) {
    const hay = `${ev.summary || ""} ${ev.location || ""} ${ev.calendarSummary || ""}`.toLowerCase();
    if (!hay.includes(q)) return false;
  }
  if (meetingFilter === "all") return true;
  return getMeetingType(ev.meetingLink) === meetingFilter;
}

function makeEventChip(ev) {
  const chip = document.createElement("div");
  chip.className = "event-chip";
  chip.style.borderLeftColor = getCalendarColor(ev.calendarId);

  const title = document.createElement("div");
  title.className = "event-title";
  title.textContent = normalizeText(ev.summary || "Evenement");

  const meta = document.createElement("div");
  meta.className = "event-meta";
  const timeStr = formatEventTime(ev);
  meta.textContent = timeStr || "";

  chip.appendChild(title);
  if (meta.textContent) chip.appendChild(meta);

  if (Array.isArray(ev.tags) && ev.tags.length) {
    const tags = document.createElement("div");
    tags.className = "event-meta";
    tags.textContent = ev.tags.join(" · ");
    chip.appendChild(tags);
  }

  if (ev.meetingLink) {
    const join = document.createElement("a");
    join.className = "event-join";
    join.href = ev.meetingLink;
    join.target = "_blank";
    join.rel = "noreferrer";
    join.textContent = "Rejoindre";
    chip.appendChild(join);
  }

  if (ev.htmlLink) {
    const link = document.createElement("a");
    link.href = ev.htmlLink;
    link.target = "_blank";
    link.rel = "noreferrer";
    link.textContent = "Ouvrir";
    chip.appendChild(link);
  }

  return chip;
}

function renderEvents(items) {
  eventsEl.innerHTML = "";
  if (!items || items.length === 0) {
    eventsStatusEl.textContent = "Aucun evenement dans cette periode.";
    return;
  }
  eventsStatusEl.textContent = "";

  const groups = new Map();
  items.filter(passesFilters).forEach((ev) => {
    const key = getEventDateKey(ev);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(ev);
  });

  const baseDate = parseDateInput(dateEl.value);
  if (viewMode === "day") {
    const key = dateKey(baseDate);
    const dayEvents = groups.get(key) || [];
    dayEvents.forEach((ev) => eventsEl.appendChild(makeEventChip(ev)));
    return;
  }

  if (viewMode === "week") {
    const start = weekStart(baseDate);
    const header = document.createElement("div");
    header.className = "calendar-week";
    for (let i = 0; i < 7; i += 1) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      const label = document.createElement("div");
      label.className = "day-header";
      label.textContent = d.toLocaleDateString(undefined, { weekday: "short", day: "numeric" });
      header.appendChild(label);
    }
    eventsEl.appendChild(header);

    const grid = document.createElement("div");
    grid.className = "calendar-week";
    for (let i = 0; i < 7; i += 1) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      const cell = document.createElement("div");
      cell.className = "day-cell";
      const key = dateKey(d);
      const dayEvents = groups.get(key) || [];
      dayEvents.forEach((ev) => cell.appendChild(makeEventChip(ev)));
      grid.appendChild(cell);
    }
    eventsEl.appendChild(grid);
    return;
  }

  const start = monthGridStart(baseDate);
  const month = baseDate.getMonth();
  const dates = [];
  for (let i = 0; i < 42; i += 1) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    dates.push(d);
  }

  const header = document.createElement("div");
  header.className = "calendar-month";
  for (let i = 0; i < 7; i += 1) {
    const label = document.createElement("div");
    label.className = "day-header";
    label.textContent = new Date(2024, 0, i + 1).toLocaleDateString(undefined, { weekday: "short" });
    header.appendChild(label);
  }
  eventsEl.appendChild(header);

  const grid = document.createElement("div");
  grid.className = "calendar-month";
  dates.forEach((d) => {
    const cell = document.createElement("div");
    cell.className = "day-cell";
    const number = document.createElement("div");
    number.className = "day-number";
    number.textContent = d.getDate();
    if (d.getMonth() !== month) number.style.opacity = "0.4";
    cell.appendChild(number);
    const key = dateKey(d);
    const dayEvents = groups.get(key) || [];
    dayEvents.slice(0, 3).forEach((ev) => cell.appendChild(makeEventChip(ev)));
    if (dayEvents.length > 3) {
      const more = document.createElement("div");
      more.className = "event-meta";
      more.textContent = `+${dayEvents.length - 3}`;
      cell.appendChild(more);
    }
    grid.appendChild(cell);
  });
  eventsEl.appendChild(grid);
}

function renderNextEvents(items) {
  nextEventsEl.innerHTML = "";
  if (!items || items.length === 0) {
    nextStatusEl.textContent = "Aucun evenement a venir.";
    return;
  }
  nextStatusEl.textContent = "";
  items.filter(passesFilters).forEach((ev) => nextEventsEl.appendChild(makeEventChip(ev)));
}

function loadNextEvents() {
  const now = new Date();
  const timeMin = now.toISOString();
  const timeMax = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString();
  nextStatusEl.textContent = "Chargement...";

  chrome.runtime.sendMessage(
    { type: "GCAL_LOAD_EVENTS", payload: { timeMin, timeMax, calendarIds: selectedIds } },
    (res) => {
      if (chrome.runtime.lastError) {
        nextStatusEl.textContent = `Erreur: ${chrome.runtime.lastError.message}`;
        return;
      }
      if (!res?.ok) {
        const err = res?.error || "inconnue";
        nextStatusEl.textContent =
          err === "AUTH_REQUIRED"
            ? "Non connecte. Connecte Google dans Options."
            : `Erreur: ${err}`;
        return;
      }
      const next = (res.events || []).slice(0, 3);
      renderNextEvents(next);
    }
  );
}

function loadCalendars() {
  calendarStatusEl.textContent = "Chargement...";
  chrome.runtime.sendMessage({ type: "GCAL_AUTH_STATUS" }, (auth) => {
    if (!auth?.connected) {
      calendarStatusEl.textContent = "Non connecte. Connecte Google dans Options.";
      return;
    }
    chrome.runtime.sendMessage({ type: "GCAL_LIST_CALENDARS" }, (res) => {
      if (chrome.runtime.lastError) {
        calendarStatusEl.textContent = `Erreur: ${chrome.runtime.lastError.message}`;
        return;
      }
      if (!res?.ok) {
        calendarStatusEl.textContent = `Erreur: ${res?.error || "inconnue"}`;
        return;
      }
      calendars = res.items || [];
      chrome.storage.local.get(["gcalSelectedCalendars"], (data) => {
        const stored = Array.isArray(data.gcalSelectedCalendars) ? data.gcalSelectedCalendars : [];
        selectedIds = stored.length ? stored : calendars.map((c) => c.id);
        renderCalendars(calendars);
        chrome.runtime.sendMessage({ type: "GCAL_GET_NOTIFY_PREFS" }, (prefs) => {
          notifyIds = Array.isArray(prefs?.ids) && prefs.ids.length
            ? prefs.ids
            : calendars.map((c) => c.id);
          renderNotifyCalendars(calendars);
        });
        loadEvents();
        loadNextEvents();
      });
    });
  });
}

let eventsDebounceId = null;
function loadEvents() {
  if (eventsDebounceId) clearTimeout(eventsDebounceId);
  eventsDebounceId = setTimeout(() => {
  const date = parseDateInput(dateEl.value);
  const { timeMin, timeMax } = rangeForView(date, viewMode);
  const now = new Date();
  const min = new Date(timeMin);
  const effectiveMin = min < now ? now : min;
  eventsStatusEl.textContent = "Chargement...";

  chrome.runtime.sendMessage(
    { type: "GCAL_LOAD_EVENTS", payload: { timeMin: effectiveMin.toISOString(), timeMax, calendarIds: selectedIds } },
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
      renderEvents(res.events || []);
    }
  );
  }, 150);
}

tabs.forEach((tab) => {
  tab.addEventListener("click", () => {
    tabs.forEach((t) => t.classList.remove("active"));
    tab.classList.add("active");
    tabs.forEach((t) => t.setAttribute("aria-selected", "false"));
    tab.setAttribute("aria-selected", "true");
    viewMode = tab.dataset.view;
    loadEvents();
  });
});

refreshBtn.addEventListener("click", loadEvents);
prevBtn.addEventListener("click", () => shiftDate(-1));
nextBtn.addEventListener("click", () => shiftDate(1));
todayBtn.addEventListener("click", () => {
  const now = new Date();
  setDateInput(now);
  loadEvents();
});

if (searchEl) {
  searchEl.addEventListener("input", () => {
    loadEvents();
    loadNextEvents();
  });
}

filterBtns.forEach((btn) => {
  btn.addEventListener("click", () => {
    filterBtns.forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    filterBtns.forEach((b) => b.setAttribute("aria-pressed", "false"));
    btn.setAttribute("aria-pressed", "true");
    meetingFilter = btn.dataset.filter || "all";
    loadEvents();
    loadNextEvents();
  });
});

dateEl.value = todayLocalDateInput();
loadCalendars();
