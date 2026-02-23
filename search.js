const qEl = document.getElementById("q");
const statusEl = document.getElementById("status");
const resultsEl = document.getElementById("results");
const filters = Array.from(document.querySelectorAll(".filter"));

let activeFilter = "all";
let debounceId = null;
let cache = {
  calendar: null,
  notion: null,
  news: null,
};

function normalizeText(input) {
  const text = (input ?? "").toString();
  return text.normalize("NFC").trim();
}

function formatDate(value) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString();
}

function clearResults() {
  resultsEl.innerHTML = "";
}

function openStageDetail(item) {
  const detail = {
    id: normalizeText(item.id || ""),
    title: normalizeText(item.title || "Stage"),
    company: normalizeText(item.company || ""),
    type: normalizeText(item.typeValue || "Stage"),
    status: normalizeText(item.status || ""),
    closeDate: normalizeText(item.closeDate || ""),
    location: normalizeText(item.location || ""),
    role: normalizeText(item.role || ""),
    openDate: normalizeText(item.openDate || ""),
    applicationDate: normalizeText(item.applicationDate || ""),
    startMonth: normalizeText(item.startMonth || ""),
    url: normalizeText(item.url || item.link || ""),
    notes: normalizeText(item.notes || ""),
  };

  const params = new URLSearchParams();
  if (detail.id) params.set("id", detail.id);
  params.set("title", detail.title);
  params.set("status", detail.status);
  params.set("deadline", detail.closeDate);
  params.set("link", detail.url);
  params.set("type", detail.type || "Stage");
  params.set("notes", detail.notes);

  chrome.storage.local.set(
    { stageDetailId: detail.id, stageDetailFallback: detail },
    () => {
      window.open(`stage-detail.html?${params.toString()}`, "_blank", "noreferrer");
    }
  );
}

function renderResults(items) {
  clearResults();
  if (!items || items.length === 0) {
    statusEl.textContent = "Aucun resultat.";
    return;
  }
  statusEl.textContent = `${items.length} resultat(s)`;
  items.forEach((item) => {
    const row = document.createElement("div");
    row.className = "result";

    const title = document.createElement("div");
    title.className = "title";
    title.textContent = item.title || "Sans titre";

    const meta = document.createElement("div");
    meta.className = "meta";
    meta.textContent = item.meta || "";

    const tag = document.createElement("span");
    tag.className = "tag";
    tag.textContent = item.typeLabel || item.type;

    if (item.type === "notion") {
      row.tabIndex = 0;
      row.style.cursor = "pointer";
      row.addEventListener("click", () => openStageDetail(item));
      row.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          openStageDetail(item);
        }
      });
    }

    row.appendChild(tag);
    row.appendChild(title);
    if (meta.textContent) row.appendChild(meta);

    if (item.link) {
      const link = document.createElement("a");
      link.href = item.link;
      link.target = "_blank";
      link.rel = "noreferrer";
      link.textContent = item.linkLabel || "Ouvrir";
      link.addEventListener("click", (e) => e.stopPropagation());
      row.appendChild(link);
    }

    resultsEl.appendChild(row);
  });
}

function matchQuery(text, query) {
  return normalizeText(text).toLowerCase().includes(query);
}

async function loadCalendar() {
  if (cache.calendar) return cache.calendar;
  const now = new Date();
  const timeMin = now.toISOString();
  const timeMax = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString();
  const { gcalSelectedCalendars } = await chrome.storage.local.get(["gcalSelectedCalendars"]);
  const ids = Array.isArray(gcalSelectedCalendars) ? gcalSelectedCalendars : [];
  const res = await new Promise((resolve) =>
    chrome.runtime.sendMessage(
      { type: "GCAL_LOAD_EVENTS", payload: { timeMin, timeMax, calendarIds: ids } },
      resolve
    )
  );
  cache.calendar = res?.ok ? res.events || [] : [];
  return cache.calendar;
}

async function loadNotion() {
  if (cache.notion) return cache.notion;
  const res = await new Promise((resolve) =>
    chrome.runtime.sendMessage({ type: "CHECK_NOTION_DB" }, resolve)
  );
  cache.notion = res?.ok ? res.rows || [] : [];
  return cache.notion;
}

async function loadNews() {
  if (cache.news) return cache.news;
  const res = await new Promise((resolve) =>
    chrome.runtime.sendMessage({ type: "GET_YAHOO_NEWS" }, resolve)
  );
  cache.news = res?.ok ? res.data?.items || [] : [];
  return cache.news;
}

async function runSearch() {
  const q = normalizeText(qEl.value).toLowerCase();
  if (!q) {
    statusEl.textContent = "Entre un terme pour lancer la recherche.";
    clearResults();
    return;
  }

  statusEl.textContent = "Recherche...";
  const results = [];

  if (activeFilter === "all" || activeFilter === "calendar") {
    const events = await loadCalendar();
    events.forEach((ev) => {
      const hay = `${ev.summary || ""} ${ev.location || ""} ${ev.calendarSummary || ""}`;
      if (!matchQuery(hay, q)) return;
      results.push({
        type: "calendar",
        typeLabel: "Calendrier",
        title: normalizeText(ev.summary || "Evenement"),
        meta: `${formatDate(ev.start)} · ${normalizeText(ev.calendarSummary || "")}`,
        link: ev.htmlLink || ev.meetingLink || "",
        linkLabel: ev.meetingLink ? "Rejoindre" : "Ouvrir",
      });
    });
  }

  if (activeFilter === "all" || activeFilter === "notion") {
    const rows = await loadNotion();
    rows.forEach((row) => {
      const hay = `${row.title || ""} ${row.company || ""} ${row.status || ""} ${row.location || ""}`;
      if (!matchQuery(hay, q)) return;
      results.push({
        type: "notion",
        typeLabel: "Stage",
        title: normalizeText([row.company, row.title].filter(Boolean).join(" - ") || "Stage"),
        meta: normalizeText(row.status || ""),
        id: row.id || "",
        company: row.company || "",
        status: row.status || "",
        typeValue: row.type || "Stage",
        closeDate: row.closeDate || "",
        location: row.location || "",
        role: row.role || "",
        openDate: row.openDate || "",
        applicationDate: row.applicationDate || "",
        startMonth: row.startMonth || "",
        url: row.url || "",
        notes: row.notes || "",
        link: row.url || "",
        linkLabel: "Offre",
      });
    });
  }

  if (activeFilter === "all" || activeFilter === "news") {
    const items = await loadNews();
    items.forEach((item) => {
      const hay = `${item.title || ""} ${item.description || ""}`;
      if (!matchQuery(hay, q)) return;
      results.push({
        type: "news",
        typeLabel: "News",
        title: normalizeText(item.title || "Article"),
        meta: formatDate(item.pubDate),
        link: item.link || "",
        linkLabel: "Lire",
      });
    });
  }

  renderResults(results);
}

function scheduleSearch() {
  if (debounceId) clearTimeout(debounceId);
  debounceId = setTimeout(runSearch, 150);
}

qEl.addEventListener("input", scheduleSearch);
filters.forEach((btn) => {
  btn.addEventListener("click", () => {
    filters.forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    filters.forEach((b) => b.setAttribute("aria-pressed", "false"));
    btn.setAttribute("aria-pressed", "true");
    activeFilter = btn.dataset.filter || "all";
    runSearch();
  });
});
