const preview = document.getElementById("preview");
const msg = document.getElementById("msg");
const addBtn = document.getElementById("add");
const extractBtn = document.getElementById("extract");
const appliedCb = document.getElementById("applied");
const openStagesEl = document.getElementById("open-stages");
const openStagesStatusEl = document.getElementById("open-stages-status");
const todoStagesEl = document.getElementById("todo-stages");
const todoStagesStatusEl = document.getElementById("todo-stages-status");

let extracted = null;

function formatPreview(data) {
  if (!data) return "Clique sur \"Lire la page\" pour extraire les infos.";
  const lines = [
    `Entreprise: ${data.company || "—"}`,
    `Poste: ${data.title || "—"}`,
    `Date de debut: ${data.startDate || "—"}`,
  ];
  return lines.join("\n");
}

function scrapeJobInfo() {
  const url = location.href;

  const getMeta = (sel) => document.querySelector(sel)?.content?.trim() || "";
  const ogTitle = getMeta('meta[property="og:title"]');
  const ogDesc = getMeta('meta[property="og:description"]') || getMeta('meta[name="description"]');

  function extractDateText(input) {
    const text = (input || "").replace(/\s+/g, " ").trim();
    if (!text) return "";

    const monthYear = /\b(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+\d{4}\b/i;
    const dayMonthYear = /\b\d{1,2}\s+(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+\d{4}\b/i;
    const iso = /\b\d{4}-\d{2}-\d{2}\b/;

    return (
      text.match(monthYear)?.[0] ||
      text.match(dayMonthYear)?.[0] ||
      text.match(iso)?.[0] ||
      ""
    );
  }

  function findStartDateFromText() {
    const labelRegex = /\bstart\s*date\b/i;
    const candidates = document.querySelectorAll("dt, dd, label, span, p, div, li, strong, b");

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
    }

    const bodyText = document.body?.innerText || "";
    const inlineMatch =
      bodyText.match(/\bstart\s*date\b\s*[:\-]?\s*([A-Za-z]+\s+\d{4})/i) ||
      bodyText.match(/\bstart\s*date\b\s*[:\-]?\s*(\d{1,2}\s+[A-Za-z]+\s+\d{4})/i) ||
      bodyText.match(/\bstart\s*date\b\s*[:\-]?\s*(\d{4}-\d{2}-\d{2})/i);
    return inlineMatch?.[1] || "";
  }

  // 1) Try JSON-LD schema.org JobPosting
  let job = null;
  const ldScripts = Array.from(document.querySelectorAll('script[type="application/ld+json"]'));
  for (const s of ldScripts) {
    try {
      const data = JSON.parse(s.textContent);
      const arr = Array.isArray(data) ? data : [data];
      const found = arr.find(
        (x) =>
          x &&
          (x["@type"] === "JobPosting" ||
            (Array.isArray(x["@type"]) && x["@type"].includes("JobPosting")))
      );
      if (found) {
        job = found;
        break;
      }
    } catch (_) {}
  }

  const title = (job?.title || ogTitle || document.title || "").trim();

  const company = (
    job?.hiringOrganization?.name ||
    job?.hiringOrganization ||
    getMeta('meta[property="og:site_name"]') ||
    ""
  )
    .toString()
    .trim();

  const locationStr = (
    job?.jobLocation?.address?.addressLocality ||
    job?.jobLocation?.address?.addressRegion ||
    job?.jobLocation?.address?.addressCountry ||
    ""
  )
    .toString()
    .trim();

  const datePosted = (job?.datePosted || "").toString().trim();
  const deadline = (job?.validThrough || "").toString().trim();
  const startDate = (
    job?.startDate ||
    job?.jobStartDate ||
    getMeta('meta[property="job:start_date"]') ||
    getMeta('meta[name="start_date"]') ||
    findStartDateFromText() ||
    ""
  )
    .toString()
    .trim();

  const description = job?.description
    ? String(job.description)
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim()
    : ogDesc;

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

extractBtn.addEventListener("click", async () => {
  msg.textContent = "";
  addBtn.disabled = true;
  preview.textContent = "Extraction...";

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: scrapeJobInfo,
    });

    extracted = result;
    preview.textContent = formatPreview(extracted);
    addBtn.disabled = false;
  } catch (e) {
    preview.textContent = "";
    msg.textContent = `Impossible d'extraire: ${e?.message || e}`;
  }
});

addBtn.addEventListener("click", async () => {
  if (!extracted) return;
  msg.textContent = "Envoi a Notion...";

  const payload = { ...extracted, applied: appliedCb.checked };

  chrome.runtime.sendMessage({ type: "UPSERT_NOTION", payload }, (res) => {
    if (chrome.runtime.lastError) {
      msg.textContent = `Erreur extension: ${chrome.runtime.lastError.message}`;
      return;
    }

    if (res?.ok) msg.textContent = `Ajoute / mis a jour (${res.mode})`;
    else msg.textContent = `Erreur: ${res?.error || "inconnue"}`;
  });
});

function renderOpenStages(items, capped) {
  openStagesEl.innerHTML = "";

  if (!items || items.length === 0) {
    const li = document.createElement("li");
    li.className = "hint";
    li.textContent = "Aucun stage charge.";
    openStagesEl.appendChild(li);
    return;
  }

  items.forEach((item) => {
    const li = document.createElement("li");
    const label = [item.company, item.title].filter(Boolean).join(" - ") || "Sans titre";

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

  if (capped) {
    const li = document.createElement("li");
    li.className = "hint";
    li.textContent = "Liste limitee.";
    openStagesEl.appendChild(li);
  }
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

function renderTodoStages(items, capped) {
  todoStagesEl.innerHTML = "";

  if (!items || items.length === 0) {
    const li = document.createElement("li");
    li.className = "hint";
    li.textContent = "Aucun stage charge.";
    todoStagesEl.appendChild(li);
    return;
  }

  items.forEach((item) => {
    const li = document.createElement("li");
    const label = [item.company, item.title].filter(Boolean).join(" - ") || "Sans titre";

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

  if (capped) {
    const li = document.createElement("li");
    li.className = "hint";
    li.textContent = "Liste limitee.";
    todoStagesEl.appendChild(li);
  }
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
