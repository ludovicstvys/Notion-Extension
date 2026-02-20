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
const stageBlockersStatusEl = document.getElementById("stage-blockers-status");
const stageBlockersListEl = document.getElementById("stage-blockers-list");
const stageQualityStatusEl = document.getElementById("stage-quality-status");
const stageQualityListEl = document.getElementById("stage-quality-list");

let stats = null;
let segments = [];
let allStages = [];
let kanbanStatus = "Ouvert";

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

function normalizeText(input) {
  const text = (input ?? "").toString();
  return text.normalize("NFC").trim();
}

function normalizeStatus(value) {
  const v = normalizeText(value).toLowerCase();
  if (v.startsWith("ouv")) return "ouvert";
  if (v.includes("candidature") || v.includes("postul")) return "candidature";
  if (v.includes("entretien") || v.includes("interview")) return "entretien";
  if (v.includes("refus") || v.includes("recal")) return "refuse";
  return "ouvert";
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
  chrome.runtime.sendMessage({ type: "GET_STAGE_WEEKLY_KPIS" }, (res) => {
    if (chrome.runtime.lastError) {
      renderWeeklyKpis({ ok: false });
      return;
    }
    renderWeeklyKpis(res);
  });
}

function renderStageBlockers(items) {
  if (!stageBlockersListEl) return;
  stageBlockersListEl.innerHTML = "";
  if (!items || items.length === 0) {
    if (stageBlockersStatusEl) stageBlockersStatusEl.textContent = "Aucun blocage détecté.";
    return;
  }
  if (stageBlockersStatusEl) stageBlockersStatusEl.textContent = `${items.length} blocage(s)`;
  items.forEach((item) => {
    const row = document.createElement("div");
    row.className = "stage-row";
    const title = document.createElement("div");
    title.className = "stage-company";
    title.textContent = normalizeText([item.company, item.title].filter(Boolean).join(" - ")) || "Stage";
    row.appendChild(title);
    const meta = document.createElement("div");
    meta.className = "stage-role";
    meta.textContent = `${item.reason} (${item.stagnantDays} jours)`;
    row.appendChild(meta);

    const actions = document.createElement("div");
    actions.className = "quick-actions";
    const nextBtn = document.createElement("button");
    nextBtn.className = "quick-btn";
    nextBtn.textContent = `Passer ${item.suggestedNextStatus}`;
    nextBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      updateStageStatus(item.id, item.suggestedNextStatus);
    });
    actions.appendChild(nextBtn);
    if (item.url) {
      const openBtn = document.createElement("button");
      openBtn.className = "quick-btn";
      openBtn.textContent = "Ouvrir lien";
      openBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        window.open(item.url, "_blank", "noreferrer");
      });
      actions.appendChild(openBtn);
    }
    row.appendChild(actions);
    stageBlockersListEl.appendChild(row);
  });
}

function loadStageBlockers() {
  if (stageBlockersStatusEl) stageBlockersStatusEl.textContent = "Chargement...";
  chrome.runtime.sendMessage({ type: "GET_STAGE_BLOCKERS" }, (res) => {
    if (chrome.runtime.lastError) {
      if (stageBlockersStatusEl) stageBlockersStatusEl.textContent = `Erreur: ${chrome.runtime.lastError.message}`;
      renderStageBlockers([]);
      return;
    }
    if (!res?.ok) {
      if (stageBlockersStatusEl) stageBlockersStatusEl.textContent = `Erreur: ${res?.error || "inconnue"}`;
      renderStageBlockers([]);
      return;
    }
    renderStageBlockers(res.items || []);
  });
}

function renderDataQualityIssues(items) {
  if (!stageQualityListEl) return;
  stageQualityListEl.innerHTML = "";
  if (!items || items.length === 0) {
    if (stageQualityStatusEl) stageQualityStatusEl.textContent = "Aucune anomalie.";
    return;
  }
  if (stageQualityStatusEl) stageQualityStatusEl.textContent = `${items.length} point(s) à corriger`;
  items.forEach((issue) => {
    const row = document.createElement("div");
    row.className = "stage-row";
    const title = document.createElement("div");
    title.className = "stage-company";
    title.textContent = `${normalizeText(issue.title || "Stage")} - ${issue.field}`;
    row.appendChild(title);
    const meta = document.createElement("div");
    meta.className = "stage-role";
    meta.textContent = issue.suggestedValue
      ? `Suggestion: ${issue.suggestedValue}`
      : "Aucune suggestion automatique.";
    row.appendChild(meta);
    const actions = document.createElement("div");
    actions.className = "quick-actions";
    if (issue.suggestedValue) {
      const applyBtn = document.createElement("button");
      applyBtn.className = "quick-btn";
      applyBtn.textContent = "Appliquer suggestion";
      applyBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        chrome.runtime.sendMessage(
          {
            type: "APPLY_STAGE_QUALITY_FIX",
            payload: { id: issue.id, field: issue.field, value: issue.suggestedValue },
          },
          () => loadStageDataQuality()
        );
      });
      actions.appendChild(applyBtn);
    }
    row.appendChild(actions);
    stageQualityListEl.appendChild(row);
  });
}

function loadStageDataQuality() {
  if (stageQualityStatusEl) stageQualityStatusEl.textContent = "Chargement...";
  chrome.runtime.sendMessage({ type: "GET_STAGE_DATA_QUALITY" }, (res) => {
    if (chrome.runtime.lastError) {
      if (stageQualityStatusEl) stageQualityStatusEl.textContent = `Erreur: ${chrome.runtime.lastError.message}`;
      renderDataQualityIssues([]);
      return;
    }
    if (!res?.ok) {
      if (stageQualityStatusEl) stageQualityStatusEl.textContent = `Erreur: ${res?.error || "inconnue"}`;
      renderDataQualityIssues([]);
      return;
    }
    renderDataQualityIssues(res.items || []);
  });
}

function makeKanbanQuickActions(item, colKey) {
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
    { key: "recale", label: "Recale", count: recale, color: "#ff453a" },
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
  statusEl.textContent = "Chargement...";
  chrome.runtime.sendMessage({ type: "GET_STAGE_STATUS_STATS" }, (res) => {
    if (chrome.runtime.lastError) {
      statusEl.textContent = `Erreur: ${chrome.runtime.lastError.message}`;
      return;
    }
    if (!res?.ok) {
      statusEl.textContent = `Erreur: ${res?.error || "inconnue"}`;
      return;
    }
    stats = res;
    buildSegments(res);
    setCenterText();
    drawChart();
    statusEl.textContent = "";
  });
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
    if (over && kanbanStatusEl) {
      kanbanStatusEl.textContent = `WIP dépassé: ${col.label} (${count}/${limit}).`;
    }
    column.appendChild(header);

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
      card.appendChild(makeKanbanQuickActions(item, col.key));

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

      column.appendChild(card);
    });

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

    kanbanBoardEl.appendChild(column);
  });
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
        renderKanban();
        applyAllStagesFilter();
        loadWeeklyKpis();
        loadStageBlockers();
        loadStageDataQuality();
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
      applyAllStagesFilter();
      renderKanban();
      loadOpenStages();
      loadStats();
      loadWeeklyKpis();
      loadStageBlockers();
      loadStageDataQuality();
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
  if (openStatusEl) openStatusEl.textContent = "";
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
    openListEl.appendChild(row);
  });
}

function loadOpenStages() {
  if (openStatusEl) openStatusEl.textContent = "Chargement...";
  chrome.runtime.sendMessage({ type: "GET_OPEN_STAGES" }, (res) => {
    if (chrome.runtime.lastError) {
      if (openStatusEl) {
        openStatusEl.textContent = `Erreur: ${chrome.runtime.lastError.message}`;
      }
      renderOpenStages([]);
      return;
    }
    if (!res?.ok) {
      if (openStatusEl) openStatusEl.textContent = `Erreur: ${res?.error || "inconnue"}`;
      renderOpenStages([]);
      return;
    }
    renderOpenStages(res.items || []);
  });
}

function renderAllStages(items) {
  if (!allListEl) return;
  allListEl.innerHTML = "";
  if (!items || items.length === 0) {
    if (allStatusEl) allStatusEl.textContent = "Aucun stage.";
    return;
  }
  if (allStatusEl) allStatusEl.textContent = `${items.length} stage(s)`;
  items.forEach((item) => {
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
    row.addEventListener("click", () => {
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
    });
    row.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        const params = new URLSearchParams();
        const detail = {
          title: normalizeText([item.company, item.title].filter(Boolean).join(" - ")) || "Stage",
          status: item.status || "",
          deadline: item.closeDate || "",
          link: item.url || "",
          type: "Stage",
          notes: item.notes || "",
        };
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
    });
    allListEl.appendChild(row);
  });
}

function applyAllStagesFilter() {
  const query = normalizeText(allSearchEl?.value || "").toLowerCase();
  if (!query) {
    renderAllStages(allStages);
    return;
  }
  const filtered = allStages.filter((item) => {
    const hay = [
      item.company,
      item.title,
      item.status,
      item.closeDate,
      item.url,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return hay.includes(query);
  });
  renderAllStages(filtered);
}

function loadAllStages() {
  if (allStatusEl) allStatusEl.textContent = "Chargement...";
  chrome.runtime.sendMessage({ type: "GET_ALL_STAGES" }, (res) => {
    if (chrome.runtime.lastError) {
      if (allStatusEl) allStatusEl.textContent = `Erreur: ${chrome.runtime.lastError.message}`;
      renderAllStages([]);
      return;
    }
    if (!res?.ok) {
      if (allStatusEl) allStatusEl.textContent = `Erreur: ${res?.error || "inconnue"}. Tentative fallback...`;
      chrome.runtime.sendMessage({ type: "CHECK_NOTION_DB" }, (fallback) => {
        if (fallback?.ok && Array.isArray(fallback.rows)) {
          renderAllStages(fallback.rows);
        } else {
          renderAllStages([]);
        }
      });
      return;
    }
    const items = Array.isArray(res.items) ? res.items : [];
    if (items.length === 0) {
      if (allStatusEl) {
        if (typeof res.total === "number") {
          allStatusEl.textContent = res.total === 0 ? "Aucun stage." : "Liste vide. Tentative fallback...";
        } else {
          allStatusEl.textContent = "Liste vide. Tentative fallback...";
        }
      }
      chrome.runtime.sendMessage({ type: "CHECK_NOTION_DB" }, (fallback) => {
        if (fallback?.ok && Array.isArray(fallback.rows) && fallback.rows.length > 0) {
          allStages = fallback.rows;
          applyAllStagesFilter();
          renderKanban();
        } else {
          allStages = [];
          renderAllStages([]);
        }
      });
      return;
    }
    allStages = items;
    applyAllStagesFilter();
    renderKanban();
  });
}

loadStats();
loadOpenStages();
loadAllStages();
loadWeeklyKpis();
loadStageBlockers();
loadStageDataQuality();

if (allSearchEl) {
  allSearchEl.addEventListener("input", () => applyAllStagesFilter());
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
