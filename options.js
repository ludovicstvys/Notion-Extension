const tokenEl = document.getElementById("token");
const dbEl = document.getElementById("db");
const statusEl = document.getElementById("status");
const checkBtn = document.getElementById("check");
const existingEl = document.getElementById("existing");
const columnsEl = document.getElementById("columns");

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

function formatRows(rows, capped) {
  if (!rows || rows.length === 0) return "Aucune ligne chargee.";

  const lines = rows.map((r, i) => {
    const parts = [r.title, r.company, r.status].filter(Boolean).join(" - ");
    const url = r.url ? `\n   ${r.url}` : "";
    return `${i + 1}. ${parts || "Sans titre"}${url}`;
  });

  const capNote = capped ? "\n\n(liste limitee)" : "";
  return `${rows.length} ligne(s) chargee(s)\n\n${lines.join("\n")}${capNote}`;
}

function formatColumns(cols) {
  if (!cols || cols.length === 0) return "Aucune colonne chargee.";
  return `Colonnes (${cols.length})\n\n${cols.join("\n")}`;
}

checkBtn.addEventListener("click", async () => {
  statusEl.textContent = "Verification Notion...";
  existingEl.textContent = "Chargement...";
  columnsEl.textContent = "Chargement...";
  checkBtn.disabled = true;

  chrome.runtime.sendMessage({ type: "CHECK_NOTION_DB" }, (res) => {
    checkBtn.disabled = false;
    if (chrome.runtime.lastError) {
      statusEl.textContent = `Erreur extension: ${chrome.runtime.lastError.message}`;
      existingEl.textContent = "Aucune ligne chargee.";
      columnsEl.textContent = "Aucune colonne chargee.";
      return;
    }

    if (res?.ok) {
      const title = res.dbTitle ? ` (${res.dbTitle})` : "";
      statusEl.textContent = `Connexion OK${title}.`;
      existingEl.textContent = formatRows(res.rows, res.capped);
      columnsEl.textContent = formatColumns(res.columns);
    } else {
      statusEl.textContent = `Erreur: ${res?.error || "inconnue"}`;
      existingEl.textContent = "Aucune ligne chargee.";
      columnsEl.textContent = "Aucune colonne chargee.";
    }
  });
});
