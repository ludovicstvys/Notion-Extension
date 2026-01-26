const tokenEl = document.getElementById("token");
const dbEl = document.getElementById("db");
const statusEl = document.getElementById("status");
const limitUrlEl = document.getElementById("limit-url");
const limitMinutesEl = document.getElementById("limit-minutes");
const addLimitBtn = document.getElementById("add-limit");
const limitsEl = document.getElementById("limits");
const limitStatusEl = document.getElementById("limit-status");

const LIMITS_KEY = "timeLimitRules";

chrome.storage.sync.get(["notionToken", "notionDbId"], (v) => {
  tokenEl.value = v.notionToken || "";
  dbEl.value = v.notionDbId || "";
});

function normalizeDbId(input) {
  const raw = (input || "").trim();
  if (!raw) return "";

  let s = raw;
  if (/^https?:\/\//i.test(s)) {
    try {
      const u = new URL(s);
      s = u.pathname || s;
    } catch (_) {
      // keep raw
    }
  }

  s = s.split("?")[0].split("#")[0];
  const parts = s.split("/");
  s = parts[parts.length - 1] || s;

  const uuid = s.match(/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/);
  if (uuid) return uuid[0].replace(/-/g, "");

  const hex = s.match(/[0-9a-fA-F]{32}/);
  if (hex) return hex[0];

  const uuidInRaw = raw.match(/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/);
  if (uuidInRaw) return uuidInRaw[0].replace(/-/g, "");

  const hexInRaw = raw.match(/[0-9a-fA-F]{32}/);
  if (hexInRaw) return hexInRaw[0];

  return "";
}

document.getElementById("save").addEventListener("click", async () => {
  const normalizedDbId = normalizeDbId(dbEl.value);
  if (!normalizedDbId) {
    statusEl.textContent = "Error: invalid database ID or URL.";
    return;
  }

  await chrome.storage.sync.set({
    notionToken: tokenEl.value.trim(),
    notionDbId: normalizedDbId,
  });

  dbEl.value = normalizedDbId;
  statusEl.textContent = "OK. Saved.";
});

function normalizeLimitPattern(input) {
  return (input || "").trim();
}

function parseLimitMinutes(input) {
  const val = Number.parseInt(input, 10);
  if (!Number.isFinite(val) || val <= 0) return null;
  return val;
}

function renderLimits(rules) {
  const items = Array.isArray(rules) ? rules : [];
  limitsEl.innerHTML = "";

  if (items.length === 0) {
    const empty = document.createElement("div");
    empty.className = "note";
    empty.textContent = "Aucune limite configuree.";
    limitsEl.appendChild(empty);
    return;
  }

  items.forEach((rule, index) => {
    const row = document.createElement("div");
    row.className = "limit-row";

    const label = document.createElement("div");
    label.className = "limit-label";
    label.textContent = `${rule.pattern} - ${rule.minutes} min / jour`;

    const actions = document.createElement("div");
    actions.className = "limit-actions";

    const delBtn = document.createElement("button");
    delBtn.textContent = "Supprimer";
    delBtn.addEventListener("click", async () => {
      const updated = items.filter((_, i) => i !== index);
      await chrome.storage.sync.set({ [LIMITS_KEY]: updated });
      renderLimits(updated);
    });

    actions.appendChild(delBtn);
    row.appendChild(label);
    row.appendChild(actions);
    limitsEl.appendChild(row);
  });
}

async function loadLimits() {
  const { timeLimitRules } = await chrome.storage.sync.get([LIMITS_KEY]);
  renderLimits(Array.isArray(timeLimitRules) ? timeLimitRules : []);
}

addLimitBtn.addEventListener("click", async () => {
  limitStatusEl.textContent = "";
  const pattern = normalizeLimitPattern(limitUrlEl.value);
  const minutes = parseLimitMinutes(limitMinutesEl.value);

  if (!pattern) {
    limitStatusEl.textContent = "Entre une URL ou un domaine.";
    return;
  }
  if (!minutes) {
    limitStatusEl.textContent = "Entre un nombre de minutes valide.";
    return;
  }

  const { timeLimitRules } = await chrome.storage.sync.get([LIMITS_KEY]);
  const rules = Array.isArray(timeLimitRules) ? timeLimitRules : [];
  const normalized = pattern.toLowerCase();
  const existingIndex = rules.findIndex(
    (r) => (r.pattern || "").toLowerCase() === normalized
  );

  if (existingIndex >= 0) {
    rules[existingIndex] = { pattern, minutes };
  } else {
    rules.push({ pattern, minutes });
  }

  await chrome.storage.sync.set({ [LIMITS_KEY]: rules });
  renderLimits(rules);
  limitUrlEl.value = "";
  limitMinutesEl.value = "";
  limitStatusEl.textContent = "Limite enregistree.";
});

loadLimits();
