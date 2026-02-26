const canvas = document.getElementById("stage-chart");
const tooltip = document.getElementById("stage-tooltip");
const statusEl = document.getElementById("stage-status");
const centerEl = document.getElementById("stage-center");
const openStatusEl = document.getElementById("stage-open-status");
const openListEl = document.getElementById("stage-open-list");
const openToggleBtn = document.getElementById("stage-open-toggle");
const allStatusEl = document.getElementById("stage-all-status");
const allListEl = document.getElementById("stage-all-list");
const allSearchEl = document.getElementById("stage-all-search");
const kanbanBoardEl = document.getElementById("kanban-board");
const kanbanListTab = document.getElementById("kanban-tab-list");
const kanbanBoardTab = document.getElementById("kanban-tab-board");
const kanbanListView = document.getElementById("kanban-view-list");
const kanbanBoardView = document.getElementById("kanban-view-board");
const kanbanStatusEl = document.getElementById("kanban-status");
const stageKpiWeekEl = document.getElementById("stage-kpi-week");
const stageKpiListEl = document.getElementById("stage-kpi-list");
const stageSyncTextEl = document.getElementById("stage-sync-text");
const stageRefreshBtn = document.getElementById("stage-refresh-btn");

let stats = null;
let segments = [];
let allStages = [];
let stageSearchIndex = [];
let kanbanStatus = "Ouvert";
let stageDashboardSnapshot = null;
let filteredStages = [];
let allStagesRenderCount = 0;
let dashboardFollowupTimer = null;

const KANBAN_COLUMNS = [
  { key: "ouvert", label: "Ouvert" },
  { key: "candidature", label: "Candidature" },
  { key: "entretien", label: "Entretien" },
  { key: "refuse", label: "Refusé" },
];
const KANBAN_WIP_LIMITS = {
  ouvert: 20,
  candidature: 15,
  entretien: 8,
  refuse: 999,
};
const STAGE_VIEW_MODE_KEY = "stageViewMode";
const STAGE_VIEW_LIST = "list";
const STAGE_VIEW_BOARD = "board";
const ALL_STAGES_PAGE_SIZE = 140;

function normalizeText(input) {
  const text = (input ?? "").toString();
  return text.normalize("NFC").trim();
}

function isRejectedStatusNorm(norm) {
  return (
    norm.includes("refus") ||
    norm.includes("recal") ||
    norm.includes("reject") ||
    norm.includes("rejet")
  );
}

function normalizeStatus(value) {
  const v = normalizeText(value).toLowerCase();
  if (v === "ouvert") return "ouvert";
  if (isRejectedStatusNorm(v)) return "refuse";
  if (v.includes("entretien") || v.includes("interview")) return "entretien";
  if (v.includes("candidature") || v.includes("postul") || v.includes("envoy")) return "candidature";
  return "candidature";
}

function isOpenStageStatus(value) {
  return normalizeText(value).toLowerCase() === "ouvert";
}

function isAppliedStageStatus(value) {
  const norm = normalizeText(value).toLowerCase();
  if (isRejectedStatusNorm(norm)) return false;
  return (
    norm === "candidature envoy?e" ||
    norm === "candidature envoyee" ||
    norm === "candidatures envoy?es" ||
    norm === "candidatures envoyees" ||
    norm === "postul?" ||
    norm === "postule" ||
    norm === "envoy?e" ||
    norm === "envoyee" ||
    norm.includes("candidature") ||
    norm.includes("postul")
  );
}

function computeStatsFromItems(items) {
  const counts = new Map();
  (items || []).forEach((item) => {
    const key = normalizeText(item?.status || "Non renseigne") || "Non renseigne";
    counts.set(key, (counts.get(key) || 0) + 1);
  });
  let open = 0;
  let applied = 0;
  let recale = 0;
  const otherBreakdown = [];
  counts.forEach((count, status) => {
    const norm = normalizeText(status).toLowerCase();
    if (norm === "ouvert") {
      open += count;
      return;
    }
    if (norm === "recal?" || norm === "recale" || isRejectedStatusNorm(norm)) {
      recale += count;
      return;
    }
    if (isAppliedStageStatus(status)) {
      applied += count;
      return;
    }
    otherBreakdown.push({ status, count });
  });
  otherBreakdown.sort((a, b) => b.count - a.count);
  const total = (items || []).length;
  return {
    ok: true,
    total,
    open,
    applied,
    recale,
    other: Math.max(0, total - open - applied - recale),
    otherBreakdown,
    capped: false,
  };
}

function debounce(fn, waitMs = 120) {
  let timer = null;
  return (...args) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => fn(...args), waitMs);
  };
}

function buildStageSearchKey(item) {
  return normalizeText(
    [
      item?.company || "",
      item?.title || "",
      item?.status || "",
      item?.closeDate || "",
      item?.url || "",
    ].join(" ")
  ).toLowerCase();
}

function rebuildStageSearchIndex() {
  stageSearchIndex = (allStages || []).map((item) => ({
    item,
    searchKey: buildStageSearchKey(item),
  }));
}

function setSyncState(snapshot, loading = false) {
  if (!stageSyncTextEl) return;
  if (loading) {
    stageSyncTextEl.textContent = "Sync: chargement...";
    return;
  }
  if (!snapshot) {
    stageSyncTextEl.textContent = "Derniere sync: -";
    return;
  }
  const d = new Date(snapshot.generatedAt || Date.now());
  const hhmm = d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  const source =
    snapshot.stale
      ? "cache stale"
      : snapshot.source === "cache"
        ? "cache"
        : "reseau";
  stageSyncTextEl.textContent = `Derniere sync ${hhmm} (${source})`;
}

function setRefreshBusy(busy) {
  if (!stageRefreshBtn) return;
  stageRefreshBtn.disabled = !!busy;
  stageRefreshBtn.textContent = busy ? "Rafraichissement..." : "Rafraichir";
}

function isUnknownMessageError(resOrText) {
  const raw =
    typeof resOrText === "string"
      ? resOrText
      : normalizeText(resOrText?.error || resOrText?.message || "");
  return normalizeText(raw).toLowerCase() === "message inconnu.";
}

function findColumnLabelByKey(key) {
  const col = KANBAN_COLUMNS.find((c) => c.key === key);
  return col?.label || "Ouvert";
}

function applyStageViewMode(mode) {
  if (!(kanbanListTab && kanbanBoardTab && kanbanListView && kanbanBoardView)) return;
  const boardMode = mode === STAGE_VIEW_BOARD;
  kanbanListTab.classList.toggle("active", !boardMode);
  kanbanBoardTab.classList.toggle("active", boardMode);
  kanbanListView.classList.toggle("kanban-hidden", boardMode);
  kanbanBoardView.classList.toggle("kanban-hidden", !boardMode);
  if (boardMode) renderKanban();
}

function persistStageViewMode(mode) {
  chrome.storage.local.set({ [STAGE_VIEW_MODE_KEY]: mode });
}

function renderWeeklyKpis(data) {
  if (!stageKpiWeekEl || !stageKpiListEl) return;
  stageKpiListEl.innerHTML = "";
  if (!data?.ok) {
    stageKpiWeekEl.textContent = "Semaine: erreur";
    return;
  }
  stageKpiWeekEl.textContent = `Semaine depuis ${data.weekStart || "-"}`;

  const rows = [
    `Stages ajoutés: ${data.addedWeek ?? 0}`,
    `Candidatures envoyées: ${data.sentWeek ?? 0}`,
    `Total stages: ${data.total ?? 0}`,
  ];
  rows.forEach((line) => {
    const item = document.createElement("div");
    item.className = "stage-row";
    item.textContent = line;
    stageKpiListEl.appendChild(item);
  });

  const top = Array.isArray(data.progressByStatus) ? data.progressByStatus.slice(0, 4) : [];
  top.forEach((entry) => {
    const item = document.createElement("div");
    item.className = "stage-row";
    item.textContent = `${entry.status}: ${entry.count} (${entry.ratio}%)`;
    stageKpiListEl.appendChild(item);
  });
}

function loadWeeklyKpis() {
  renderWeeklyKpis(stageDashboardSnapshot?.weeklyKpis || { ok: false });
}

function makeKanbanQuickActions(item, colKey) {
  if (colKey === "refuse") return null;
  const wrap = document.createElement("div");
  wrap.className = "kanban-actions";
  const transitions = [
    { key: "candidature", label: "Candidature envoyée" },
    { key: "entretien", label: "Entretien" },
    { key: "refuse", label: "Refusé" },
  ];
  transitions.forEach((transition) => {
    if (transition.key === colKey) return;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "kanban-action";
    btn.textContent = transition.label;
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      updateStageStatus(item.id, findColumnLabelByKey(transition.key));
    });
    wrap.appendChild(btn);
  });
  return wrap;
}

function buildSegments(data) {
  const total = data.total || 0;
  const open = data.open || 0;
  const applied = data.applied || 0;
  const recale = data.recale || 0;
  const other = data.other || 0;

  const list = [
    { key: "open", label: "Ouvert", count: open, color: "#0a84ff" },
    { key: "applied", label: "Candidatures envoyees", count: applied, color: "#34c759" },
    { key: "other", label: "Autres", count: other, color: "#8e8e93" },
    { key: "recale", label: "Refus\u00e9", count: recale, color: "#ff453a" },
  ].filter((s) => s.count > 0);

  if (list.length === 0 && total === 0) {
    segments = [];
    return;
  }

  const sum = list.reduce((acc, s) => acc + s.count, 0) || 1;
  let angle = -Math.PI / 2;
  segments = list.map((seg) => {
    const size = (seg.count / sum) * Math.PI * 2;
    const start = angle;
    const end = angle + size;
    angle = end;
    return { ...seg, start, end };
  });
}

function resizeCanvas() {
  if (!canvas) return;
  const size = Math.min(canvas.parentElement.clientWidth || 320, 420);
  const ratio = window.devicePixelRatio || 1;
  canvas.width = size * ratio;
  canvas.height = size * ratio;
  canvas.style.width = `${size}px`;
  canvas.style.height = `${size}px`;
}

function drawChart() {
  if (!canvas) return;
  resizeCanvas();
  const ctx = canvas.getContext("2d");
  const w = canvas.width;
  const h = canvas.height;
  const ratio = window.devicePixelRatio || 1;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.scale(ratio, ratio);

  const size = Math.min(canvas.clientWidth, canvas.clientHeight);
  const cx = size / 2;
  const cy = size / 2;
  const radius = size * 0.42;
  const inner = size * 0.30;

  ctx.clearRect(0, 0, size, size);

  if (!segments.length) {
    ctx.strokeStyle = "rgba(148, 163, 184, 0.25)";
    ctx.lineWidth = 12;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.stroke();
    return;
  }

  segments.forEach((seg) => {
    ctx.beginPath();
    ctx.strokeStyle = seg.color;
    ctx.lineWidth = 16;
    ctx.lineCap = "round";
    ctx.arc(cx, cy, radius, seg.start, seg.end);
    ctx.stroke();
  });

  const gradient = ctx.createRadialGradient(cx, cy, inner * 0.2, cx, cy, inner);
  gradient.addColorStop(0, "rgba(15, 23, 42, 0.95)");
  gradient.addColorStop(1, "rgba(11, 18, 32, 1)");
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(cx, cy, inner, 0, Math.PI * 2);
  ctx.fill();
}

function setCenterText() {
  if (!centerEl || !stats) return;
  const total = stats.total || 0;
  const open = stats.open || 0;
  const nonOpen = Math.max(0, total - open);
  centerEl.innerHTML = `
    <div class="count">${nonOpen}</div>
  `;
}

function formatTooltipContent(seg) {
  if (!stats) return "";
  if (seg.key === "other") {
    const lines = (stats.otherBreakdown || []).map((item) => `${item.status} (${item.count})`);
    if (lines.length === 0) return "Autres (0)";
    return `Autres (${seg.count})<div class="muted">${lines.join("<br />")}</div>`;
  }
  return `${seg.label} (${seg.count})`;
}

function onMouseMove(e) {
  if (!canvas || !segments.length) return;
  const rect = canvas.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;
  const size = Math.min(canvas.clientWidth, canvas.clientHeight);
  const cx = size / 2;
  const cy = size / 2;
  const dx = x - cx;
  const dy = y - cy;
  const dist = Math.sqrt(dx * dx + dy * dy);
  const radius = size * 0.42;
  const inner = size * 0.26;

  if (dist < inner || dist > radius + 12) {
    tooltip.classList.remove("visible");
    return;
  }

  let angle = Math.atan2(dy, dx);
  if (angle < -Math.PI / 2) angle += Math.PI * 2;
  const seg = segments.find((s) => angle >= s.start && angle <= s.end);
  if (!seg) {
    tooltip.classList.remove("visible");
    return;
  }
  tooltip.innerHTML = formatTooltipContent(seg);
  tooltip.style.left = `${x}px`;
  tooltip.style.top = `${y}px`;
  tooltip.classList.add("visible");
}

function onMouseLeave() {
  tooltip.classList.remove("visible");
}

function loadStats() {
  const next = stageDashboardSnapshot?.stats || computeStatsFromItems(allStages);
  if (!next?.ok) {
    statusEl.textContent = "Erreur: stats indisponibles";
    return;
  }
  stats = next;
  buildSegments(next);
  setCenterText();
  drawChart();
  if (statusEl) {
    statusEl.textContent = stageDashboardSnapshot?.stale ? "Affichage depuis le cache..." : "";
  }
}

if (canvas) {
  canvas.addEventListener("mousemove", onMouseMove);
  canvas.addEventListener("mouseleave", onMouseLeave);
  window.addEventListener("resize", drawChart);
}

function renderKanban() {
  if (!kanbanBoardEl) return;
  kanbanBoardEl.innerHTML = "";
  if (kanbanStatusEl) kanbanStatusEl.textContent = "";
  const boardFrag = document.createDocumentFragment();
  const groups = KANBAN_COLUMNS.reduce((acc, col) => {
    acc[col.key] = [];
    return acc;
  }, {});
  allStages.forEach((item) => {
    const key = normalizeStatus(item.status);
    if (!groups[key]) groups[key] = [];
    groups[key].push(item);
  });

  KANBAN_COLUMNS.forEach((col) => {
    const column = document.createElement("div");
    column.className = "kanban-column";
    column.dataset.status = col.label;

    const header = document.createElement("div");
    header.className = "kanban-header";
    const count = groups[col.key].length;
    const limit = KANBAN_WIP_LIMITS[col.key] ?? 999;
    const over = count > limit;
    header.innerHTML = `<span>${col.label}</span><span class="kanban-count${over ? " over-limit" : ""}">${count}/${limit}</span>`;
    column.appendChild(header);
    const cardsWrap = document.createElement("div");
    cardsWrap.className = "kanban-cards";
    const cardsFrag = document.createDocumentFragment();

    groups[col.key].forEach((item) => {
      const card = document.createElement("div");
      card.className = "kanban-card";
      card.draggable = true;
      card.dataset.id = item.id || "";
      card.dataset.status = col.label;

      const company = document.createElement("div");
      company.className = "kanban-company";
      company.textContent = normalizeText(item.company || item.title || "Stage");
      card.appendChild(company);

      const role = document.createElement("div");
      role.className = "kanban-role";
      role.textContent = normalizeText(item.title && item.company ? item.title : "Stage");
      card.appendChild(role);
      const quickActionsEl = makeKanbanQuickActions(item, col.key);
      if (quickActionsEl) card.appendChild(quickActionsEl);

      card.addEventListener("dragstart", (e) => {
        card.classList.add("dragging");
        e.dataTransfer.setData("text/plain", item.id || "");
        kanbanStatus = col.label;
      });
      card.addEventListener("dragend", () => card.classList.remove("dragging"));
      card.addEventListener("click", () => {
        if (!item.id) return;
        const params = new URLSearchParams();
        params.set("id", item.id);
        params.set("title", normalizeText([item.company, item.title].filter(Boolean).join(" - ")));
        params.set("status", item.status || "");
        params.set("deadline", item.closeDate || "");
        params.set("link", item.url || "");
        params.set("type", "Stage");
        chrome.storage.local.set({ stageDetailId: item.id || "", stageDetailFallback: item }, () => {
          window.open(`stage-detail.html?${params.toString()}`, "_blank", "noreferrer");
        });
      });

      cardsFrag.appendChild(card);
    });
    cardsWrap.appendChild(cardsFrag);
    column.appendChild(cardsWrap);

    column.addEventListener("dragover", (e) => {
      e.preventDefault();
    });
    column.addEventListener("drop", (e) => {
      e.preventDefault();
      const id = e.dataTransfer.getData("text/plain");
      if (!id) return;
      const targetStatus = col.label;
      if (targetStatus === kanbanStatus) return;
      updateStageStatus(id, targetStatus);
    });

    boardFrag.appendChild(column);
  });
  kanbanBoardEl.appendChild(boardFrag);
}

function updateStageStatus(id, status) {
  const item = allStages.find((s) => s.id === id);
  if (!item) return;
  chrome.runtime.sendMessage(
    { type: "UPDATE_STAGE_STATUS", payload: { id, status } },
    (res) => {
      if (chrome.runtime.lastError) {
        const msg = `Erreur extension: ${chrome.runtime.lastError.message}`;
        if (kanbanStatusEl) kanbanStatusEl.textContent = msg;
        if (allStatusEl) allStatusEl.textContent = msg;
        return;
      }
      if (res?.ok) {
        if (kanbanStatusEl) kanbanStatusEl.textContent = "";
        item.status = status;
        if (res?.rejectedQueue && !res.rejectedQueue.ok && kanbanStatusEl) {
          kanbanStatusEl.textContent = `Status OK, queue KO: ${res.rejectedQueue.error || "inconnue"}`;
        }
        rebuildStageSearchIndex();
        renderKanban();
        applyAllStagesFilter({ reset: false });
        stageDashboardSnapshot = {
          ...(stageDashboardSnapshot || {}),
          allStages: allStages.slice(),
          openStages: allStages.filter((s) => isOpenStageStatus(s.status)),
          stats: computeStatsFromItems(allStages),
          stale: true,
        };
        renderOpenStages(stageDashboardSnapshot.openStages);
        loadStats();
        queueDashboardRefresh(250);
      } else {
        const msg = `Erreur: ${res?.error || "mise a jour impossible"}`;
        if (kanbanStatusEl) kanbanStatusEl.textContent = msg;
        if (allStatusEl) allStatusEl.textContent = msg;
      }
    }
  );
}

function deleteStage(id, label) {
  const stageId = normalizeText(id || "");
  if (!stageId) return;
  const stageLabel = normalizeText(label || "ce stage");
  const confirmed = window.confirm(`Supprimer ce stage de Notion ?\n${stageLabel}`);
  if (!confirmed) return;

  if (openStatusEl) openStatusEl.textContent = "Suppression...";
  chrome.runtime.sendMessage(
    { type: "DELETE_STAGE", payload: { id: stageId } },
    (res) => {
      if (chrome.runtime.lastError) {
        if (openStatusEl) openStatusEl.textContent = `Erreur: ${chrome.runtime.lastError.message}`;
        return;
      }
      if (!res?.ok) {
        const err = res?.error || "suppression impossible";
        const hint =
          err === "Message inconnu."
            ? "Extension pas rechargee. Recharge l'extension puis reessaie."
            : `Erreur: ${err}`;
        if (openStatusEl) openStatusEl.textContent = hint;
        return;
      }
      allStages = allStages.filter((stage) => stage.id !== stageId);
      rebuildStageSearchIndex();
      applyAllStagesFilter({ reset: false });
      renderKanban();
      stageDashboardSnapshot = {
        ...(stageDashboardSnapshot || {}),
        allStages: allStages.slice(),
        openStages: allStages.filter((s) => isOpenStageStatus(s.status)),
        stats: computeStatsFromItems(allStages),
        stale: true,
      };
      renderOpenStages(stageDashboardSnapshot.openStages);
      loadStats();
      queueDashboardRefresh(250);
    }
  );
}

function renderOpenStages(items) {
  if (!openListEl) return;
  openListEl.innerHTML = "";
  if (!items || items.length === 0) {
    if (openStatusEl) openStatusEl.textContent = "Aucun stage ouvert.";
    return;
  }
  if (openStatusEl) {
    openStatusEl.textContent = stageDashboardSnapshot?.stale
      ? `${items.length} stage(s) ouvert(s) - cache`
      : "";
  }
  const fragment = document.createDocumentFragment();
  items.forEach((item) => {
    const row = document.createElement("div");
    row.className = "stage-row";
    const company = document.createElement("div");
    company.className = "stage-company";
    company.textContent = normalizeText(item.company || item.title || "Stage");
    row.appendChild(company);

    const role = document.createElement("div");
    role.className = "stage-role";
    role.textContent = normalizeText(item.title && item.company ? item.title : "Stage ouvert");
    row.appendChild(role);

    const badges = document.createElement("div");
    badges.className = "stage-badges";
    if (item.status) {
      const badge = document.createElement("div");
      badge.className = "stage-badge status";
      badge.textContent = normalizeText(item.status);
      badges.appendChild(badge);
    }
    if (badges.childNodes.length > 0) row.appendChild(badges);

    const actions = document.createElement("div");
    actions.className = "quick-actions";

    if (item.url) {
      const openBtn = document.createElement("button");
      openBtn.type = "button";
      openBtn.className = "quick-btn";
      openBtn.textContent = "Ouvrir lien";
      openBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        window.open(item.url, "_blank", "noreferrer");
      });
      openBtn.addEventListener("keydown", (e) => e.stopPropagation());
      actions.appendChild(openBtn);
    }

    if (item.id) {
      const deleteBtn = document.createElement("button");
      deleteBtn.type = "button";
      deleteBtn.className = "quick-btn quick-btn-danger";
      deleteBtn.textContent = "Supprimer";
      deleteBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        deleteStage(
          item.id,
          normalizeText([item.company, item.title].filter(Boolean).join(" - ")) || "ce stage"
        );
      });
      deleteBtn.addEventListener("keydown", (e) => e.stopPropagation());
      actions.appendChild(deleteBtn);
    }

    if (actions.childNodes.length > 0) row.appendChild(actions);

    if (item.url) {
      row.addEventListener("click", () => {
        window.open(item.url, "_blank", "noreferrer");
      });
      row.addEventListener("keydown", (e) => {
        if (e.key === "Enter") window.open(item.url, "_blank", "noreferrer");
      });
      row.tabIndex = 0;
    }
    fragment.appendChild(row);
  });
  openListEl.appendChild(fragment);
}

function loadOpenStages() {
  const items = Array.isArray(stageDashboardSnapshot?.openStages)
    ? stageDashboardSnapshot.openStages.filter((item) => isOpenStageStatus(item?.status))
    : allStages.filter((item) => isOpenStageStatus(item.status));
  renderOpenStages(items);
}

function openStageDetail(item) {
  const detail = {
    title: normalizeText([item.company, item.title].filter(Boolean).join(" - ")) || "Stage",
    meta: "Stage",
    deadline: item.closeDate || "",
    status: item.status || "",
    link: item.url || "",
    type: "Stage",
    notes: item.notes || "",
  };
  const params = new URLSearchParams();
  if (item.id) params.set("id", item.id);
  params.set("title", detail.title);
  params.set("status", detail.status);
  params.set("deadline", detail.deadline);
  params.set("link", detail.link);
  params.set("type", detail.type);
  chrome.storage.local.set(
    { stageDetailId: item.id || "", stageDetailFallback: detail },
    () => {
      window.open(`stage-detail.html?${params.toString()}`, "_blank", "noreferrer");
    }
  );
}

function renderAllStages(items) {
  if (!allListEl) return;
  allListEl.innerHTML = "";
  if (!items || items.length === 0) {
    if (allStatusEl) allStatusEl.textContent = "Aucun stage.";
    filteredStages = [];
    return;
  }
  const total = items.length;
  const visible = Math.min(Math.max(allStagesRenderCount, ALL_STAGES_PAGE_SIZE), total);
  if (allStatusEl) {
    const suffix = visible < total ? ` - ${visible} affiches` : "";
    const cacheTag = stageDashboardSnapshot?.stale ? " - cache" : "";
    allStatusEl.textContent = `${total} stage(s)${suffix}${cacheTag}`;
  }
  const fragment = document.createDocumentFragment();
  items.slice(0, visible).forEach((item) => {
    const row = document.createElement("div");
    row.className = "stage-row";
    const company = document.createElement("div");
    company.className = "stage-company";
    company.textContent = normalizeText(item.company || item.title || "Stage");
    row.appendChild(company);

    const role = document.createElement("div");
    role.className = "stage-role";
    role.textContent = normalizeText(item.title && item.company ? item.title : "Stage");
    row.appendChild(role);

    const badges = document.createElement("div");
    badges.className = "stage-badges";
    if (item.status) {
      const badge = document.createElement("div");
      badge.className = "stage-badge status";
      badge.textContent = normalizeText(item.status);
      badges.appendChild(badge);
    }
    if (item.closeDate) {
      const badge = document.createElement("div");
      badge.className = "stage-badge deadline";
      badge.textContent = normalizeText(item.closeDate);
      badges.appendChild(badge);
    }
    if (badges.childNodes.length > 0) row.appendChild(badges);
    row.tabIndex = 0;
    row.addEventListener("click", () => openStageDetail(item));
    row.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        openStageDetail(item);
      }
    });
    fragment.appendChild(row);
  });
  if (visible < total) {
    const moreWrap = document.createElement("div");
    moreWrap.className = "stage-row";
    const moreBtn = document.createElement("button");
    moreBtn.type = "button";
    moreBtn.className = "quick-btn";
    moreBtn.textContent = `Afficher plus (${total - visible} restant(s))`;
    moreBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      allStagesRenderCount += ALL_STAGES_PAGE_SIZE;
      renderAllStages(filteredStages);
    });
    moreWrap.appendChild(moreBtn);
    fragment.appendChild(moreWrap);
  }
  allListEl.appendChild(fragment);
}

function applyAllStagesFilter(options = {}) {
  if (options.reset !== false) {
    allStagesRenderCount = ALL_STAGES_PAGE_SIZE;
  }
  const query = normalizeText(allSearchEl?.value || "").toLowerCase();
  if (!query) {
    filteredStages = allStages.slice();
    renderAllStages(filteredStages);
    return;
  }
  const matches = [];
  for (let i = 0; i < stageSearchIndex.length; i += 1) {
    const entry = stageSearchIndex[i];
    if (!entry.searchKey.includes(query)) continue;
    matches.push(entry.item);
  }
  filteredStages = matches;
  renderAllStages(filteredStages);
}

function loadAllStages() {
  applyAllStagesFilter({ reset: true });
  renderKanban();
}

function applyDashboardSnapshot(snapshot, options = {}) {
  stageDashboardSnapshot = snapshot || null;
  allStages = Array.isArray(snapshot?.allStages) ? snapshot.allStages.slice() : [];
  rebuildStageSearchIndex();
  loadStats();
  loadOpenStages();
  loadAllStages();
  const renderSecondary = () => {
    loadWeeklyKpis();
  };
  if (options.deferSecondary) {
    requestAnimationFrame(() => {
      requestAnimationFrame(renderSecondary);
    });
  } else {
    renderSecondary();
  }
  setSyncState(snapshot, false);
}

function loadLegacyDashboard(options = {}) {
  setSyncState(stageDashboardSnapshot, true);
  chrome.runtime.sendMessage({ type: "GET_ALL_STAGES" }, (allRes) => {
    if (chrome.runtime.lastError) {
      if (!options.silent && statusEl) {
        statusEl.textContent = `Erreur: ${chrome.runtime.lastError.message}`;
      }
      return;
    }
    if (!allRes?.ok) {
      if (!options.silent && statusEl) {
        statusEl.textContent = `Erreur: ${allRes?.error || "inconnue"}`;
      }
      return;
    }
    const items = Array.isArray(allRes.items) ? allRes.items : [];
    const baseSnapshot = {
      version: 1,
      generatedAt: Date.now(),
      source: "network",
      stale: false,
      total: items.length,
      allStages: items,
      openStages: items.filter((s) => isOpenStageStatus(s.status)),
      stats: computeStatsFromItems(items),
      weeklyKpis: { ok: false },
    };
    applyDashboardSnapshot(baseSnapshot, { deferSecondary: false });

    chrome.runtime.sendMessage({ type: "GET_STAGE_WEEKLY_KPIS" }, (kpiRes) => {
      if (!kpiRes?.ok) return;
      stageDashboardSnapshot = {
        ...(stageDashboardSnapshot || {}),
        weeklyKpis: kpiRes,
        generatedAt: Date.now(),
      };
      loadWeeklyKpis();
    });
  });
}

function refreshStageDashboardNow(options = {}) {
  setRefreshBusy(true);
  setSyncState(stageDashboardSnapshot, true);
  chrome.runtime.sendMessage({ type: "REFRESH_STAGE_DASHBOARD" }, (res) => {
    setRefreshBusy(false);
    if (chrome.runtime.lastError) {
      if (isUnknownMessageError(chrome.runtime.lastError.message)) {
        loadLegacyDashboard({ silent: !!options.silent });
        return;
      }
      if (!options.silent && statusEl) {
        statusEl.textContent = `Erreur refresh: ${chrome.runtime.lastError.message}`;
      }
      return;
    }
    if (!res?.ok || !res?.snapshot) {
      if (isUnknownMessageError(res)) {
        loadLegacyDashboard({ silent: !!options.silent });
        return;
      }
      if (!options.silent && statusEl) {
        statusEl.textContent = `Erreur refresh: ${res?.error || "inconnue"}`;
      }
      return;
    }
    applyDashboardSnapshot(res.snapshot, { deferSecondary: true });
  });
}

function queueDashboardRefresh(delayMs = 1000) {
  if (dashboardFollowupTimer) {
    clearTimeout(dashboardFollowupTimer);
  }
  dashboardFollowupTimer = setTimeout(() => {
    dashboardFollowupTimer = null;
    refreshStageDashboardNow({ silent: true });
  }, Math.max(0, Number(delayMs) || 0));
}

function loadStageDashboard(options = {}) {
  const payload = {
    force: !!options.force,
    allowStale: options.allowStale !== false,
  };
  if (!stageDashboardSnapshot) {
    if (statusEl) statusEl.textContent = "Chargement...";
    if (allStatusEl) allStatusEl.textContent = "Chargement...";
    if (openStatusEl) openStatusEl.textContent = "Chargement...";
  }
  setSyncState(stageDashboardSnapshot, true);
  chrome.runtime.sendMessage({ type: "GET_STAGE_DASHBOARD", payload }, (res) => {
    if (chrome.runtime.lastError) {
      if (isUnknownMessageError(chrome.runtime.lastError.message)) {
        loadLegacyDashboard({ silent: !!options.silent });
        return;
      }
      const msg = `Erreur: ${chrome.runtime.lastError.message}`;
      if (statusEl) statusEl.textContent = msg;
      if (!stageDashboardSnapshot) {
        renderOpenStages([]);
        renderAllStages([]);
      }
      return;
    }
    if (!res?.ok || !res?.snapshot) {
      if (isUnknownMessageError(res)) {
        loadLegacyDashboard({ silent: !!options.silent });
        return;
      }
      const msg = `Erreur: ${res?.error || "inconnue"}`;
      if (statusEl) statusEl.textContent = msg;
      if (!stageDashboardSnapshot) {
        renderOpenStages([]);
        renderAllStages([]);
      }
      return;
    }
    applyDashboardSnapshot(res.snapshot, { deferSecondary: true });
    if (res.snapshot.stale) {
      queueDashboardRefresh(1500);
    }
  });
}

loadStageDashboard({ allowStale: true });

if (allSearchEl) {
  const onSearch = debounce(() => applyAllStagesFilter({ reset: true }), 120);
  allSearchEl.addEventListener("input", onSearch);
}

if (stageRefreshBtn) {
  stageRefreshBtn.addEventListener("click", () => {
    refreshStageDashboardNow({ silent: false });
  });
}

if (kanbanListTab && kanbanBoardTab && kanbanListView && kanbanBoardView) {
  kanbanListTab.addEventListener("click", () => {
    applyStageViewMode(STAGE_VIEW_LIST);
    persistStageViewMode(STAGE_VIEW_LIST);
  });
  kanbanBoardTab.addEventListener("click", () => {
    applyStageViewMode(STAGE_VIEW_BOARD);
    persistStageViewMode(STAGE_VIEW_BOARD);
  });
  chrome.storage.local.get([STAGE_VIEW_MODE_KEY], (data) => {
    const saved = data?.[STAGE_VIEW_MODE_KEY];
    applyStageViewMode(saved === STAGE_VIEW_BOARD ? STAGE_VIEW_BOARD : STAGE_VIEW_LIST);
  });
}

if (openToggleBtn && openListEl) {
  openToggleBtn.addEventListener("click", () => {
    const minimized = openListEl.classList.toggle("minimized");
    openToggleBtn.textContent = minimized ? "Agrandir" : "Minimiser";
  });
}
