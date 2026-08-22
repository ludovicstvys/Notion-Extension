const preview = document.getElementById("preview");
const msg = document.getElementById("msg");
const addBtn = document.getElementById("add");
const appliedCb = document.getElementById("applied");
const openStagesEl = document.getElementById("open-stages");
const openStagesStatusEl = document.getElementById("open-stages-status");
const openStagesCountEl = document.getElementById("open-stages-count");
const todoStagesEl = document.getElementById("todo-stages");
const todoStagesStatusEl = document.getElementById("todo-stages-status");
const todoStagesCountEl = document.getElementById("todo-stages-count");
const offlineStatusEl = document.getElementById("offline-status");
const toastStackEl = document.getElementById("toast-stack");
const focusPhaseEl = document.getElementById("focus-phase");
const focusSummaryEl = document.getElementById("focus-summary");
const focusRemainingEl = document.getElementById("focus-remaining");
const focusProgressEl = document.getElementById("focus-progress");
const focusConnectionEl = document.getElementById("focus-connection");
const focusStartBtn = document.getElementById("focus-start");
const focusStopBtn = document.getElementById("focus-stop");
const focusToggleBtn = document.getElementById("focus-toggle");
const focusRefreshBtn = document.getElementById("focus-refresh");
const navButtons = Array.from(document.querySelectorAll(".nav-btn"));

let extracted = null;
let focusPollTimer = null;
let currentFocusState = null;

function sendRuntimeMessage(message) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(message, (res) => {
      const err = chrome.runtime.lastError;
      if (err) resolve({ ok: false, error: err.message });
      else resolve(res || { ok: false, error: "empty response" });
    });
  });
}

function formatDuration(totalSeconds) {
  const s = Math.max(0, Math.floor(totalSeconds || 0));
  const m = String(Math.floor(s / 60)).padStart(2, "0");
  const r = String(s % 60).padStart(2, "0");
  return `${m}:${r}`;
}

function phaseLabel(state) {
  if (!state?.isConnected) return "App not running";
  if (state.isEnabled && state.phase === "work" && !state.isPaused) return "Focus active";
  if (state.isEnabled && state.isPaused) return "Paused";
  if (state.isEnabled && state.phase === "shortBreak") return "Break";
  return "Focus off";
}

function renderFocusState(state, dnrError = "") {
  currentFocusState = state || null;
  if (focusPhaseEl) focusPhaseEl.textContent = phaseLabel(state);
  if (focusSummaryEl) {
    focusSummaryEl.textContent =
      dnrError ||
      state?.summary ||
      (state?.isConnected ? "Connexion locale établie." : "Connexion locale en attente.");
  }
  if (focusRemainingEl) {
    focusRemainingEl.textContent = state?.isConnected
      ? `Temps restant: ${formatDuration(state.remainingSeconds)} / ${formatDuration(state.totalSeconds)}`
      : "--:--";
  }
  if (focusProgressEl) {
    focusProgressEl.style.width = `${Math.max(0, Math.min(100, Math.round((state?.progress || 0) * 100)))}%`;
  }
  if (focusConnectionEl) {
    focusConnectionEl.textContent = state?.isConnected ? "Connected" : "Offline";
  }
  if (focusToggleBtn) {
    focusToggleBtn.textContent = state?.isPaused ? "Resume" : "Pause";
  }
  if (focusStartBtn) focusStartBtn.disabled = !!(state?.isConnected && state?.isEnabled && state.phase === "work" && !state.isPaused);
  if (focusStopBtn) focusStopBtn.disabled = !state?.isConnected;
}

async function refreshFocusState() {
  const res = await sendRuntimeMessage({ type: "FOCUS_REFRESH" });
  if (!res?.ok || !res?.state) {
    renderFocusState({
      isConnected: false,
      isEnabled: false,
      isPaused: false,
      phase: "idle",
      summary: "App not running",
      remainingSeconds: 0,
      totalSeconds: 0,
      progress: 0,
    });
    return;
  }
  renderFocusState(res.state, res.dnrError || "");
}

function startFocusPolling() {
  if (focusPollTimer) return;
  focusPollTimer = setInterval(() => {
    refreshFocusState().catch(() => {});
  }, 1500);
}

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
  refreshOfflineStatus();
}

chrome.runtime.onMessage.addListener((msg) => {
  handleNotionQueueEvent(msg);
});

chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.type !== "FOCUS_STATE_UPDATED") return;
  renderFocusState(msg.state || null);
});

function formatPreview(data) {
  if (!data) return "";
  const lines = [
    `Entreprise: ${normalizeText(data.company) || "—"}`,
    `Poste: ${normalizeText(data.title) || "—"}`,
    `Date de debut: ${normalizeText(data.startDate) || "—"}`,
  ];
  return lines.join("\n");
}

async function scrapeJobInfo() {
  const url = location.href;
  const host = location.hostname.toLowerCase();

  const getMeta = (sel) => document.querySelector(sel)?.content?.trim() || "";
  const ogTitle = getMeta('meta[property="og:title"]');
  const ogDesc = getMeta('meta[property="og:description"]') || getMeta('meta[name="description"]');
  const cleanText = (input) =>
    (input || "")
      .toString()
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/gi, " ")
      .replace(/&amp;/gi, "&")
      .replace(/\s+/g, " ")
      .trim();
  const pick = (...values) => values.map(cleanText).find(Boolean) || "";
  const textFromNode = (selector) => {
    const el = document.querySelector(selector);
    return cleanText(el?.innerText || el?.textContent || "");
  };
  const valueByKeys = (obj, keys, depth = 0, seen = new WeakSet()) => {
    if (!obj || typeof obj !== "object" || depth > 6 || seen.has(obj)) return "";
    seen.add(obj);
    if (Array.isArray(obj)) {
      return obj
        .map((item) =>
          item && typeof item === "object"
            ? valueByKeys(item, keys, depth + 1, seen)
            : cleanText(item)
        )
        .filter(Boolean)
        .join(", ");
    }
    const entries = Object.entries(obj);
    const match = entries.find(([key]) => keys.includes(key.toLowerCase()));
    if (!match) {
      for (const [, nested] of entries) {
        if (!nested || typeof nested !== "object") continue;
        const found = valueByKeys(nested, keys, depth + 1, seen);
        if (found) return found;
      }
      return "";
    }
    const value = match[1];
    if (Array.isArray(value)) {
      return value
        .map((item) =>
          item && typeof item === "object"
            ? valueByKeys(item, keys, depth + 1, seen)
            : cleanText(item)
        )
        .filter(Boolean)
        .join(", ");
    }
    if (value && typeof value === "object") {
      return (
        valueByKeys(value, [
          ...keys,
          "name",
          "title",
          "label",
          "text",
          "addresslocality",
          "addressregion",
          "addresscountry",
        ], depth + 1, seen) || cleanText(value.name || value.title || value.label || value.text)
      );
    }
    return cleanText(value);
  };

  function extractDateText(input) {
    const text = (input || "").replace(/\s+/g, " ").trim();
    if (!text) return "";

    const monthYear = /\b(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+\d{4}\b/i;
    const dayMonthYear = /\b\d{1,2}\s+(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+\d{4}\b/i;
    const iso = /\b\d{4}-\d{2}-\d{2}\b/;
    const slash = /\b\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4}\b/;
    const frenchMonth =
      /\b\d{1,2}\s+(janvier|fevrier|février|mars|avril|mai|juin|juillet|aout|août|septembre|octobre|novembre|decembre|décembre)\s+\d{4}\b/i;

    return (
      text.match(monthYear)?.[0] ||
      text.match(dayMonthYear)?.[0] ||
      text.match(iso)?.[0] ||
      text.match(slash)?.[0] ||
      text.match(frenchMonth)?.[0] ||
      ""
    );
  }

  function findDateNearLabel(labelRegex) {
    // Avoid walking every container on large job boards. Reading `innerText` from
    // thousands of nested divs repeatedly forces layout and can freeze the page.
    const candidates = Array.from(
      document.querySelectorAll("dt, dd, label, span, p, li, strong, b")
    ).slice(0, 600);

    for (const el of candidates) {
      const text = (el.textContent || "").trim();
      if (!text || !labelRegex.test(text)) continue;

      const nearby = [];
      if (el.nextElementSibling) nearby.push(el.nextElementSibling);
      if (el.parentElement) {
        const siblings = Array.from(el.parentElement.children || []);
        const idx = siblings.indexOf(el);
        if (idx >= 0 && idx + 1 < siblings.length) nearby.push(siblings[idx + 1]);
        if (el.parentElement.nextElementSibling) nearby.push(el.parentElement.nextElementSibling);
      }

      for (const node of nearby) {
        const val = extractDateText(node?.textContent || "");
        if (val) return val;
      }
      const inline = extractDateText(text.replace(labelRegex, " "));
      if (inline) return inline;
    }

    const bodyText = document.body?.innerText || "";
    const match = bodyText.match(new RegExp(`${labelRegex.source}\\s*[:\\-]?\\s*([^\\n]{0,90})`, "i"));
    return extractDateText(match?.[1] || "");
  }

  function flattenJson(value, out = [], depth = 0, seen = new WeakSet()) {
    if (!value || typeof value !== "object" || depth > 6 || seen.has(value)) return out;
    seen.add(value);
    if (Array.isArray(value)) {
      value.forEach((item) => flattenJson(item, out, depth + 1, seen));
      return out;
    }
    out.push(value);
    Object.values(value).forEach((item) => flattenJson(item, out, depth + 1, seen));
    return out;
  }

  function isJobPosting(obj) {
    const type = obj?.["@type"] || obj?.type;
    return type === "JobPosting" || (Array.isArray(type) && type.includes("JobPosting"));
  }

  function jobFromObject(obj) {
    if (!obj || typeof obj !== "object") return {};
    return {
      title: valueByKeys(obj, ["title", "jobtitle", "positiontitle", "name"]),
      company:
        valueByKeys(obj?.hiringOrganization, ["name", "title"]) ||
        valueByKeys(obj, ["company", "companyname", "employername", "organizationname", "legalname"]),
      location:
        valueByKeys(obj?.jobLocation, [
          "name",
          "text",
          "addresslocality",
          "addressregion",
          "addresscountry",
        ]) || valueByKeys(obj, ["location", "locationstext", "locations", "city", "country"]),
      datePosted: valueByKeys(obj, ["dateposted", "postedon", "publicationdate", "createdat"]),
      startDate: valueByKeys(obj, ["startdate", "jobstartdate"]),
      deadline: valueByKeys(obj, ["validthrough", "deadline", "closingdate", "applicationdeadline"]),
      description: valueByKeys(obj, ["description", "jobdescription", "descriptionhtml", "content", "body"]),
    };
  }

  function bestJobFromJson(value) {
    const objects = flattenJson(value);
    return (
      objects.find(isJobPosting) ||
      objects
        .map((obj) => ({ obj, data: jobFromObject(obj) }))
        .filter(({ data }) => data.title && (data.description || data.company || data.location))
        .sort((a, b) => cleanText(b.data.description).length - cleanText(a.data.description).length)[0]?.obj ||
      null
    );
  }

  function parseJsonScripts() {
    const scripts = Array.from(
      document.querySelectorAll('script[type="application/ld+json"], script#__NEXT_DATA__, script[type="application/json"]')
    );
    for (const script of scripts) {
      try {
        const found = bestJobFromJson(JSON.parse(script.textContent || "{}"));
        if (found) return found;
      } catch (_) {}
    }
    return null;
  }

  function parseWindowState() {
    const values = [];
    [
      "__NEXT_DATA__",
      "__NUXT__",
      "__APOLLO_STATE__",
      "__INITIAL_STATE__",
      "__PRELOADED_STATE__",
      "initialState",
      "workday",
    ].forEach((name) => {
      try {
        if (window[name]) values.push(window[name]);
      } catch (_) {}
    });
    try {
      Object.keys(localStorage || {}).forEach((key) => {
        if (!/(job|offer|posting|state|persist|sainoo|workday|efc|efinancial)/i.test(key)) return;
        const raw = localStorage.getItem(key);
        if (raw && /^[\[{]/.test(raw.trim())) values.push(JSON.parse(raw));
      });
    } catch (_) {}
    return values.map(bestJobFromJson).find(Boolean) || null;
  }

  async function fetchWorkdayJob() {
    if (!/myworkdayjobs\.com$/i.test(host)) return null;
    const match = location.pathname.match(/\/job\/([^/?#]+)/i);
    const wd = window.workday || {};
    const tenant = wd.tenant || host.split(".")[0];
    const siteId = wd.siteId || location.pathname.split("/").filter(Boolean)[1] || "External";
    const posting = decodeURIComponent(match?.[1] || "");
    if (!tenant || !siteId || !posting) return null;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    try {
      const res = await fetch(`/wday/cxs/${tenant}/${siteId}/job/${encodeURIComponent(posting)}`, {
        credentials: "include",
        headers: { Accept: "application/json" },
        signal: controller.signal,
      });
      if (!res.ok) return null;
      const data = await res.json();
      const info = data?.jobPostingInfo || data?.job || data;
      return {
        title: info.title || info.jobTitle || "",
        company: info.hiringOrganization?.name || info.company || getMeta('meta[property="og:site_name"]') || "",
        location: info.location || info.locationsText || info.jobLocation || "",
        datePosted: info.postedOn || info.datePosted || "",
        startDate: info.startDate || "",
        deadline: info.validThrough || "",
        description: info.jobDescription || info.description || "",
      };
    } catch (_) {
      return null;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  function domainCompanyFallback() {
    if (/sainoo\.com$/i.test(host)) {
      return host
        .replace(/\.sainoo\.com$/i, "")
        .replace(/[-_]+/g, " ")
        .replace(/\b\w/g, (m) => m.toUpperCase());
    }
    if (/myworkdayjobs\.com$/i.test(host)) return host.split(".")[0].replace(/[-_]+/g, " ");
    return "";
  }

  function bestDescriptionBlockText() {
    const selectors = [
      '[data-testid*="description" i]',
      '[data-test*="description" i]',
      '[data-qa*="description" i]',
      '[id*="description" i]',
      '[class*="description" i]',
      '[data-testid*="job-offer" i]',
      '[class*="job-offer" i]',
      '[class*="offer" i]',
      '[class*="posting" i]',
      "article",
      "main section",
      "main",
    ];
    const nodes = [];
    selectors.forEach((selector) => {
      document.querySelectorAll(selector).forEach((node) => nodes.push(node));
    });
    document.querySelectorAll("section, article, main, [role='main']").forEach((node) => {
      const text = cleanText(node.innerText || node.textContent || "");
      if (text.length >= 250) nodes.push(node);
    });
    const pageText = cleanText(document.body?.innerText || "");
    const blacklist = /\b(apply|postuler|save|share|login|sign in|connexion|cookies|security checkup)\b/i;
    return nodes
      .slice(0, 250)
      .map((node) => cleanText(node.innerText || node.textContent || ""))
      .filter((text, index, arr) => text.length >= 180 && text !== pageText && !blacklist.test(text.slice(0, 160)) && arr.indexOf(text) === index)
      .sort((a, b) => {
        const score = (text) =>
          text.length +
          (/\b(role|responsibilities|missions|profile|candidate|requirements|private equity|internship|stage)\b/i.test(text)
            ? 1000
            : 0);
        return score(b) - score(a);
      })[0] || "";
  }

  const workdayJob = await fetchWorkdayJob();
  const job = workdayJob || parseJsonScripts() || parseWindowState();
  const jobData = jobFromObject(job);

  const title = pick(
    workdayJob?.title,
    jobData.title,
    textFromNode('[data-automation-id="jobPostingHeader"]'),
    textFromNode('[data-testid*="job-title" i]'),
    textFromNode('[class*="job-title" i]'),
    textFromNode("h1"),
    ogTitle,
    document.title
  );

  const company = pick(
    workdayJob?.company,
    jobData.company,
    textFromNode('[data-automation-id="company"]'),
    textFromNode('[data-testid*="company" i]'),
    textFromNode('[class*="company" i]'),
    getMeta('meta[property="og:site_name"]'),
    domainCompanyFallback()
  );

  const locationStr = pick(
    workdayJob?.location,
    jobData.location,
    textFromNode('[data-automation-id="locations"]'),
    textFromNode('[data-testid*="location" i]'),
    textFromNode('[class*="location" i]'),
    getMeta('meta[property="job:location"]')
  );

  let datePosted = pick(workdayJob?.datePosted, extractDateText(jobData.datePosted));
  if (!datePosted) {
    datePosted = findDateNearLabel(/\b(date posted|posted|publication|publiee|publiée)\b/i);
  }
  let deadline = pick(workdayJob?.deadline, extractDateText(jobData.deadline));
  if (!deadline) {
    deadline = findDateNearLabel(/\b(deadline|closing date|application deadline|date limite|fermeture)\b/i);
  }
  let startDate = pick(
    workdayJob?.startDate,
    extractDateText(jobData.startDate),
    getMeta('meta[property="job:start_date"]'),
    getMeta('meta[name="start_date"]')
  );
  if (!startDate) {
    startDate = findDateNearLabel(/\b(start date|date de debut|date de début|debut|début)\b/i);
  }

  let description = pick(
    workdayJob?.description,
    jobData.description,
    textFromNode('[data-automation-id="jobPostingDescription"]'),
    textFromNode('[data-testid*="description" i]'),
    textFromNode('[class*="job-description" i]'),
    textFromNode('[class*="description" i]'),
    textFromNode("article"),
    ogDesc
  );
  if (!description || description.length < 120) {
    const blockDescription = bestDescriptionBlockText();
    if (blockDescription.length > description.length) description = blockDescription;
  }
  if (!description || description.length < 120) {
    const pageText = cleanText(document.body?.innerText || "");
    if (pageText.length > description.length) {
      const marker = pageText.match(/\b(job description|description du poste|responsibilities|missions)\b/i);
      description = marker
        ? pageText.slice(marker.index, marker.index + 2500).trim()
        : bestDescriptionBlockText() || description;
    }
  }

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
  msg.textContent = "";
  addBtn.disabled = true;
    preview.textContent = "Extraction...";

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    let injection;
    try {
      injection = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: scrapeJobInfo,
        world: "MAIN",
      });
    } catch (err) {
      injection = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: scrapeJobInfo,
      });
    }
    const [{ result }] = injection;

    extracted = result;
    preview.textContent = formatPreview(extracted);
    addBtn.disabled = false;
    return true;
  } catch (e) {
    preview.textContent = "";
    msg.textContent = `Impossible d'extraire: ${e?.message || e}`;
    return false;
  }
}

addBtn.addEventListener("click", async () => {
  if (!extracted) {
    const ok = await extractFromPage();
    if (!ok) return;
  }
  msg.textContent = "Ajout a la queue Notion...";

  const payload = { ...extracted, applied: appliedCb.checked };

  chrome.runtime.sendMessage({ type: "UPSERT_NOTION", payload }, (res) => {
    if (chrome.runtime.lastError) {
      msg.textContent = `Erreur extension: ${chrome.runtime.lastError.message}`;
      return;
    }

    if (res?.ok) {
      msg.textContent = "";
      showToast(`Stage ajoute a la queue: ${queueLabelFromPayload(payload)}`, "queue");
    }
    else msg.textContent = `Erreur: ${res?.error || "inconnue"}`;
  });
});

function parseDateValue(value) {
  if (!value) return null;
  const isoMatch = String(value).match(/\b\d{4}-\d{2}-\d{2}\b/);
  if (isoMatch) return { date: isoMatch[0] };
  const parsed = new Date(value);
  if (!Number.isNaN(parsed.getTime())) {
    const y = parsed.getFullYear();
    const m = String(parsed.getMonth() + 1).padStart(2, "0");
    const d = String(parsed.getDate()).padStart(2, "0");
    return { date: `${y}-${m}-${d}` };
  }
  return null;
}

async function getDefaultCalendarId() {
  const data = await chrome.storage.local.get(["gcalDefaultCalendar"]);
  return data.gcalDefaultCalendar || "primary";
}



function renderOpenStages(items, _capped) {
  openStagesEl.innerHTML = "";
  if (openStagesCountEl) {
    const count = Array.isArray(items) ? items.length : 0;
    openStagesCountEl.textContent = `(${count})`;
  }

  if (!items || items.length === 0) {
    const li = document.createElement("li");
    li.className = "hint";
    li.textContent = "Aucun stage charge.";
    openStagesEl.appendChild(li);
    return;
  }

  items.forEach((item) => {
    const li = document.createElement("li");
    const label = [normalizeText(item.company), normalizeText(item.title)]
      .filter(Boolean)
      .join(" - ") || "Sans titre";

    if (item.url) {
      const link = document.createElement("a");
      link.href = item.url;
      link.target = "_blank";
      link.rel = "noreferrer";
      link.textContent = label;
      li.appendChild(link);
    } else {
      li.textContent = label;
    }

    openStagesEl.appendChild(li);
  });

}

function loadOpenStages() {
  openStagesStatusEl.textContent = "Chargement...";

  chrome.runtime.sendMessage({ type: "GET_OPEN_STAGES" }, (res) => {
    if (chrome.runtime.lastError) {
      openStagesStatusEl.textContent = `Erreur extension: ${chrome.runtime.lastError.message}`;
      renderOpenStages([], false);
      return;
    }

    if (res?.ok) {
      openStagesStatusEl.textContent = "";
      renderOpenStages(res.items, res.capped);
    } else {
      const err = res?.error || "inconnue";
      const hint =
        err === "Message inconnu."
          ? "Extension pas rechargee. Recharge l'extension."
          : `Erreur: ${err}`;
      openStagesStatusEl.textContent = hint;
      renderOpenStages([], false);
    }
  });
}

loadOpenStages();

function renderTodoStages(items, _capped) {
  todoStagesEl.innerHTML = "";
  if (todoStagesCountEl) {
    const count = Array.isArray(items) ? items.length : 0;
    todoStagesCountEl.textContent = `(${count})`;
  }

  if (!items || items.length === 0) {
    const li = document.createElement("li");
    li.className = "hint";
    li.textContent = "Aucun stage charge.";
    todoStagesEl.appendChild(li);
    return;
  }

  items.forEach((item) => {
    const li = document.createElement("li");
    const label = [normalizeText(item.company), normalizeText(item.title)]
      .filter(Boolean)
      .join(" - ") || "Sans titre";

    if (item.url) {
      const link = document.createElement("a");
      link.href = item.url;
      link.target = "_blank";
      link.rel = "noreferrer";
      link.textContent = label;
      li.appendChild(link);
    } else {
      li.textContent = label;
    }

    todoStagesEl.appendChild(li);
  });

}

function loadTodoStages() {
  todoStagesStatusEl.textContent = "Chargement...";

  chrome.runtime.sendMessage({ type: "GET_TODO_STAGES" }, (res) => {
    if (chrome.runtime.lastError) {
      todoStagesStatusEl.textContent = `Erreur extension: ${chrome.runtime.lastError.message}`;
      renderTodoStages([], false);
      return;
    }

    if (res?.ok) {
      todoStagesStatusEl.textContent = "";
      renderTodoStages(res.items, res.capped);
    } else {
      const err = res?.error || "inconnue";
      const hint =
        err === "Message inconnu."
          ? "Extension pas rechargee. Recharge l'extension."
          : `Erreur: ${err}`;
      todoStagesStatusEl.textContent = hint;
      renderTodoStages([], false);
    }
  });
}

loadTodoStages();

function refreshOfflineStatus() {
  if (!offlineStatusEl) return;
  chrome.runtime.sendMessage({ type: "OFFLINE_QUEUE_STATUS" }, (res) => {
    if (!res?.ok) {
      offlineStatusEl.textContent = "";
      return;
    }
    offlineStatusEl.textContent = res.count
      ? `${res.count} action(s) en attente dans la queue Notion.`
      : "";
  });
}

refreshOfflineStatus();

navButtons.forEach((btn) => {
  btn.addEventListener("click", async () => {
    const href = btn.getAttribute("data-href");
    if (!href) return;
    await chrome.tabs.create({ url: chrome.runtime.getURL(href) });
  });
});

if (focusStartBtn) {
  focusStartBtn.addEventListener("click", async () => {
    await sendRuntimeMessage({ type: "FOCUS_START" });
    await refreshFocusState();
  });
}

if (focusStopBtn) {
  focusStopBtn.addEventListener("click", async () => {
    await sendRuntimeMessage({ type: "FOCUS_STOP" });
    await refreshFocusState();
  });
}

if (focusToggleBtn) {
  focusToggleBtn.addEventListener("click", async () => {
    await sendRuntimeMessage({ type: "FOCUS_TOGGLE_PAUSE" });
    await refreshFocusState();
  });
}

if (focusRefreshBtn) {
  focusRefreshBtn.addEventListener("click", async () => {
    await refreshFocusState();
  });
}

refreshFocusState().catch(() => {});
startFocusPolling();
