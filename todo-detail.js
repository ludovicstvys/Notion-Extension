const params = new URLSearchParams(location.search);
const paramId = params.get("id") || "";

const taskEl = document.getElementById("todo-task");
const statusEl = document.getElementById("todo-status");
const deadlineEl = document.getElementById("todo-deadline");
const addedDateEl = document.getElementById("todo-added-date");
const priorityEl = document.getElementById("todo-priority");
const stageEl = document.getElementById("todo-stage");
const notesEl = document.getElementById("todo-notes");
const openStageBtn = document.getElementById("todo-open-stage");
const openLinkEl = document.getElementById("todo-open-link");
const loadStatusEl = document.getElementById("todo-load-status");

let currentTodo = {
  id: "",
  task: "",
  stageId: "",
  stageLabel: "",
  stageLink: "",
};

function normalizeText(input) {
  const text = (input ?? "").toString();
  return text.normalize("NFC").trim();
}

function formatDateDisplay(input) {
  const raw = normalizeText(input || "");
  if (!raw) return "-";
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return raw;
  const withTime = raw.includes("T");
  return d.toLocaleString("fr-FR", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
    ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}),
  });
}

function setStageActionsVisibility() {
  const stageId = normalizeText(currentTodo.stageId || "");
  if (openStageBtn) {
    openStageBtn.classList.toggle("hidden", !stageId);
  }

  const link = normalizeText(currentTodo.stageLink || "");
  if (openLinkEl) {
    if (link) {
      openLinkEl.href = link;
      openLinkEl.classList.remove("hidden");
    } else {
      openLinkEl.href = "#";
      openLinkEl.classList.add("hidden");
    }
  }
}

function applyData(data) {
  const item = data || {};
  const task = normalizeText(item.task || "Tache");
  const status = normalizeText(item.status || "");
  const dueDate = normalizeText(item.dueDate || "");
  const addedDate = normalizeText(item.addedDate || item.createdAt || "");
  const priority = normalizeText(item.priority || "");
  const notes = normalizeText(item.notes || "");
  const stageId = normalizeText(item.stageId || "");
  const stageLabel = normalizeText(item.stageLabel || "");
  const stageLink = normalizeText(item.stageLink || "");

  if (taskEl) taskEl.textContent = task || "Tache";
  if (statusEl) statusEl.textContent = status || "-";
  if (deadlineEl) deadlineEl.textContent = formatDateDisplay(dueDate);
  if (addedDateEl) addedDateEl.textContent = formatDateDisplay(addedDate);
  if (priorityEl) priorityEl.textContent = priority || "-";
  if (stageEl) stageEl.textContent = stageLabel || (stageId ? stageId : "-");
  if (notesEl) notesEl.textContent = notes || "-";

  currentTodo = {
    id: normalizeText(item.id || currentTodo.id || ""),
    task,
    stageId,
    stageLabel,
    stageLink,
  };
  setStageActionsVisibility();
}

function sendMessageAsync(message) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(message, (res) => {
      if (chrome.runtime.lastError) {
        resolve({ ok: false, error: chrome.runtime.lastError.message || "Erreur extension." });
        return;
      }
      resolve(res || { ok: false, error: "Aucune reponse." });
    });
  });
}

async function hydrateStageData(stageId) {
  const id = normalizeText(stageId || "");
  if (!id || !chrome?.runtime?.sendMessage) return;
  const res = await sendMessageAsync({ type: "GET_STAGE_BY_ID", payload: { id } });
  if (!res?.ok || !res.item) return;

  const item = res.item || {};
  const label =
    normalizeText([item.company, item.title].filter(Boolean).join(" - ")) ||
    normalizeText(item.title || "") ||
    id;
  const url = normalizeText(item.url || "");

  currentTodo.stageLabel = label;
  if (!currentTodo.stageLink && url) {
    currentTodo.stageLink = url;
  }
  if (stageEl) stageEl.textContent = currentTodo.stageLabel;
  setStageActionsVisibility();
}

function openStageDetail() {
  const stageId = normalizeText(currentTodo.stageId || "");
  if (!stageId) return;

  const query = new URLSearchParams();
  query.set("id", stageId);
  query.set("title", normalizeText(currentTodo.stageLabel || ""));
  query.set("link", normalizeText(currentTodo.stageLink || ""));

  const fallback = {
    id: stageId,
    title: normalizeText(currentTodo.stageLabel || ""),
    url: normalizeText(currentTodo.stageLink || ""),
  };

  const openPage = () => {
    window.open(`stage-detail.html?${query.toString()}`, "_blank", "noreferrer");
  };

  if (chrome?.storage?.local) {
    chrome.storage.local.set({ stageDetailId: stageId, stageDetailFallback: fallback }, openPage);
    return;
  }
  openPage();
}

if (openStageBtn) {
  openStageBtn.addEventListener("click", openStageDetail);
}

const fallbackFromParams = {
  id: paramId,
  task: params.get("task") || "",
  status: params.get("status") || "",
  dueDate: params.get("dueDate") || "",
  addedDate: params.get("addedDate") || "",
  priority: params.get("priority") || "",
  stageId: params.get("stageId") || "",
  stageLabel: params.get("stageLabel") || "",
  stageLink: params.get("stageLink") || "",
  notes: params.get("notes") || "",
};

function loadTodo(todoId, fallback) {
  const id = normalizeText(todoId || "");
  if (!id || !chrome?.runtime?.sendMessage) {
    applyData(fallback || fallbackFromParams);
    if (loadStatusEl) loadStatusEl.textContent = "Aucun ID, affichage partiel.";
    hydrateStageData(fallback?.stageId || fallbackFromParams.stageId || "");
    return;
  }

  currentTodo.id = id;
  if (loadStatusEl) loadStatusEl.textContent = "Chargement...";
  chrome.runtime.sendMessage({ type: "GET_TODO_NOTION_BY_ID", payload: { id } }, (res) => {
    if (res?.ok && res.item) {
      applyData(res.item);
      if (loadStatusEl) loadStatusEl.textContent = "";
    } else {
      applyData(fallback || fallbackFromParams);
      if (loadStatusEl) {
        loadStatusEl.textContent = res?.error
          ? `Erreur: ${res.error}`
          : "Impossible de charger, affichage partiel.";
      }
    }
    hydrateStageData(currentTodo.stageId || fallback?.stageId || "");
  });
}

if (chrome?.storage?.local) {
  chrome.storage.local.get(["todoDetailId", "todoDetailFallback"], (data) => {
    const storedId = normalizeText(data.todoDetailId || "");
    const storedFallback = data.todoDetailFallback || {};
    const resolvedId = normalizeText(paramId || storedId || "");
    const mergedFallback = { ...storedFallback, ...fallbackFromParams };
    loadTodo(resolvedId, mergedFallback);
  });
} else {
  loadTodo(paramId, fallbackFromParams);
}
