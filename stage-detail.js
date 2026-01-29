const params = new URLSearchParams(location.search);
const paramId = params.get("id") || "";
const loadStatusEl = document.getElementById("load-status");
const notesSaveBtn = document.getElementById("notes-save");
const notesStatusEl = document.getElementById("notes-status");
const prepCvEl = document.getElementById("prep-cv");
const prepFollowEl = document.getElementById("prep-follow");
const prepReminderEl = document.getElementById("prep-reminder");
const prepNotesEl = document.getElementById("prep-notes");
const prepSaveBtn = document.getElementById("prep-save");
const prepStatusEl = document.getElementById("prep-status");
let currentStageId = "";
let currentStageTitle = "";
let currentStageLink = "";

function normalizeText(input) {
  const text = (input ?? "").toString();
  return text.normalize("NFC").trim();
}

function formatDateDisplay(input) {
  if (!input) return "-";
  const d = new Date(input);
  if (Number.isNaN(d.getTime())) return input;
  return d.toLocaleDateString("fr-FR", {
    weekday: "short",
    day: "2-digit",
    month: "short",
  });
}

function applyData(data) {
  const title = normalizeText(data.title || "Stage");
  document.getElementById("title").textContent = title;
  currentStageTitle = title;
  document.getElementById("company").textContent = normalizeText(data.company || "-");
  document.getElementById("type").textContent = normalizeText(data.type || "-");
  document.getElementById("status").textContent = normalizeText(data.status || "-");
  document.getElementById("deadline").textContent = formatDateDisplay(data.closeDate || "");
  document.getElementById("location").textContent = normalizeText(data.location || "-");
  document.getElementById("role").textContent = normalizeText(data.role || "-");
  document.getElementById("open-date").textContent = formatDateDisplay(data.openDate || "");
  document.getElementById("application-date").textContent = formatDateDisplay(
    data.applicationDate || ""
  );
  document.getElementById("start-month").textContent = normalizeText(data.startMonth || "-");
  const notesEl = document.getElementById("notes");
  if (notesEl) notesEl.value = normalizeText(data.notes || "");

  const linkEl = document.getElementById("link");
  const link = normalizeText(data.url || "");
  if (link) {
    linkEl.href = link;
    linkEl.textContent = "Ouvrir l'offre";
    linkEl.classList.remove("disabled");
    currentStageLink = link;
  } else {
    linkEl.href = "#";
    linkEl.textContent = "Lien indisponible";
    linkEl.classList.add("disabled");
    currentStageLink = "";
  }
}

const fallbackFromParams = {
  title: params.get("title") || "Stage",
  type: params.get("type") || "",
  status: params.get("status") || "",
  closeDate: params.get("deadline") || "",
  url: params.get("link") || "",
  notes: params.get("notes") || "",
};

function loadStage(id, fallback) {
  if (!id || !chrome?.runtime?.sendMessage) {
    applyData(fallback || fallbackFromParams);
    if (loadStatusEl) {
      loadStatusEl.textContent = "Aucun ID trouve, affichage partiel.";
    }
    return;
  }
  currentStageId = id;
  if (loadStatusEl) loadStatusEl.textContent = "Chargement...";
  chrome.runtime.sendMessage({ type: "GET_STAGE_BY_ID", payload: { id } }, (res) => {
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
    loadPrepState();
  });
}

if (chrome?.storage?.local) {
  chrome.storage.local.get(["stageDetailId", "stageDetailFallback"], (data) => {
    const storedId = data.stageDetailId || "";
    const storedFallback = data.stageDetailFallback || {};
    const resolvedId = paramId || storedId;
    const resolvedFallback = { ...storedFallback, ...fallbackFromParams };
    loadStage(resolvedId, resolvedFallback);
  });
} else {
  loadStage(paramId, fallbackFromParams);
}

function loadPrepState() {
  const stageId = currentStageId || paramId;
  if (!stageId || !chrome?.storage?.local) return;
  chrome.storage.local.get([`prep:${stageId}`], (data) => {
    const prep = data[`prep:${stageId}`] || {};
    if (prepCvEl) prepCvEl.checked = !!prep.cvSent;
    if (prepFollowEl) prepFollowEl.checked = !!prep.followUpSent;
    if (prepReminderEl) prepReminderEl.value = prep.reminderAt || "";
    if (prepNotesEl) prepNotesEl.value = prep.notes || "";
  });
}

if (prepSaveBtn) {
  prepSaveBtn.addEventListener("click", () => {
    const stageId = currentStageId || paramId;
    if (!stageId) {
      if (prepStatusEl) prepStatusEl.textContent = "Impossible sans ID.";
      return;
    }
    const payload = {
      cvSent: !!prepCvEl?.checked,
      followUpSent: !!prepFollowEl?.checked,
      reminderAt: prepReminderEl?.value || "",
      notes: prepNotesEl?.value || "",
      updatedAt: Date.now(),
    };
    chrome.storage.local.set({ [`prep:${stageId}`]: payload }, () => {
      if (prepStatusEl) prepStatusEl.textContent = "Sauve.";
    });

    if (payload.reminderAt) {
      chrome.runtime?.sendMessage?.({
        type: "SCHEDULE_INTERVIEW_REMINDER",
        payload: {
          id: stageId,
          when: payload.reminderAt,
          title: currentStageTitle || "Entretien",
          link: currentStageLink || "",
        },
      });
    } else {
      chrome.runtime?.sendMessage?.({ type: "CLEAR_INTERVIEW_REMINDER", payload: { id: stageId } });
    }
  });
}
if (notesSaveBtn) {
  notesSaveBtn.addEventListener("click", () => {
    const notes = normalizeText(document.getElementById("notes")?.value || "");
    const submit = (id) => {
      if (!id) {
        if (notesStatusEl) notesStatusEl.textContent = "Impossible sans ID.";
        return;
      }
      if (notesStatusEl) notesStatusEl.textContent = "Enregistrement...";
      chrome.runtime.sendMessage(
        { type: "UPDATE_STAGE_NOTES", payload: { id, notes } },
        (res) => {
          if (notesStatusEl) {
            notesStatusEl.textContent = res?.ok
              ? "Notes mises a jour."
              : `Erreur: ${res?.error || "inconnue"}`;
          }
        }
      );
    };

    if (paramId) {
      submit(paramId);
      return;
    }
    if (chrome?.storage?.local) {
      chrome.storage.local.get(["stageDetailId"], (data) => submit(data.stageDetailId || ""));
      return;
    }
    if (notesStatusEl) notesStatusEl.textContent = "Impossible sans ID.";
  });
}
