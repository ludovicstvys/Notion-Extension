const canvas = document.getElementById("stage-chart");
const tooltip = document.getElementById("stage-tooltip");
const statusEl = document.getElementById("stage-status");
const centerEl = document.getElementById("stage-center");
const openStatusEl = document.getElementById("stage-open-status");
const openListEl = document.getElementById("stage-open-list");

let stats = null;
let segments = [];

function normalizeText(input) {
  const text = (input ?? "").toString();
  return text.normalize("NFC").trim();
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
    const title = document.createElement("div");
    title.className = "stage-title";
    title.textContent = normalizeText([item.company, item.title].filter(Boolean).join(" - "));
    row.appendChild(title);
    if (item.status) {
      const meta = document.createElement("div");
      meta.className = "stage-meta";
      meta.textContent = normalizeText(item.status);
      row.appendChild(meta);
    }
    if (item.url) {
      const link = document.createElement("a");
      link.href = item.url;
      link.target = "_blank";
      link.rel = "noreferrer";
      link.textContent = "Ouvrir l'offre";
      row.appendChild(link);
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

loadStats();
loadOpenStages();
