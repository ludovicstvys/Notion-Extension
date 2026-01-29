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

function buildSegments(data) {
  const total = data.total || 0;
  const open = data.open || 0;
  const applied = data.applied || 0;
  const recale = data.recale || 0;
  const other = data.other || 0;

  const list = [
    { key: "open", label: "Ouvert", count: open, color: "#0a84ff" },
    { key: "applied", label: "Candidatures envoyées", count: applied, color: "#34c759" },
    { key: "other", label: "Autres", count: other, color: "#8e8e93" },
    { key: "recale", label: "Recalé", count: recale, color: "#ff453a" },
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
    if (res.capped) {
      statusEl.textContent = "Données limitées (200).";
    } else {
      statusEl.textContent = "";
    }
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
    header.innerHTML = `<span>${col.label}</span><span class="kanban-count">${groups[col.key].length}</span>`;
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
      if (res?.ok) {
        item.status = status;
        renderKanban();
        applyAllStagesFilter();
      } else {
        // keep local state unchanged
      }
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

if (allSearchEl) {
  allSearchEl.addEventListener("input", () => applyAllStagesFilter());
}

if (kanbanListTab && kanbanBoardTab && kanbanListView && kanbanBoardView) {
  kanbanListTab.addEventListener("click", () => {
    kanbanListTab.classList.add("active");
    kanbanBoardTab.classList.remove("active");
    kanbanListView.classList.remove("kanban-hidden");
    kanbanBoardView.classList.add("kanban-hidden");
  });
  kanbanBoardTab.addEventListener("click", () => {
    kanbanBoardTab.classList.add("active");
    kanbanListTab.classList.remove("active");
    kanbanBoardView.classList.remove("kanban-hidden");
    kanbanListView.classList.add("kanban-hidden");
    renderKanban();
  });
}

if (openToggleBtn && openListEl) {
  openToggleBtn.addEventListener("click", () => {
    const minimized = openListEl.classList.toggle("minimized");
    openToggleBtn.textContent = minimized ? "Agrandir" : "Minimiser";
  });
}
