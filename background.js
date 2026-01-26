const NOTION_VERSION = "2022-06-28";
const MAX_LIST_ROWS = 200;

async function notionFetch(token, path, method, body) {
  const res = await fetch(`https://api.notion.com/v1/${path}`,
    {
      method,
      headers: {
        "Authorization": `Bearer ${token}`,
        "Notion-Version": NOTION_VERSION,
        "Content-Type": "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
    }
  );

  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const baseMsg = json?.message || `HTTP ${res.status}`;
    if (res.status === 404 && path.startsWith("databases/")) {
      throw new Error(`${baseMsg} (check the database ID and sharing settings)`);
    }
    throw new Error(baseMsg);
  }
  return json;
}

function todayISODate() {
  return new Date().toISOString().slice(0, 10);
}

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

async function findByUrl(token, dbId, url) {
  const body = {
    filter: {
      property: "lien offre",
      url: { equals: url },
    },
  };
  const r = await notionFetch(token, `databases/${dbId}/query`, "POST", body);
  return r.results?.[0] || null;
}

function buildProps(data) {
  const props = {
    "Job Title": { rich_text: [{ text: { content: data.title || "Sans titre" } }] },
    "Entreprise": { title: [{ text: { content: data.company || "" } }] },
    "Lieu": { rich_text: [{ text: { content: data.location || "" } }] },
    "lien offre": { rich_text: [{ text: { content: data.url || "" } }] },
    "Status": { status: { name: data.applied ? "Candidature envoyée" : "Ouvert" } },
  };
  if (data.applied) {
    props["Application Date"] = { date: { start: todayISODate() } };
  }
  if (data.datePosted) {
    props["Date d'ouverture"] = {
      rich_text: [{ text: { content: String(data.datePosted) } }],
    };
  }

  if (data.startDate) {
    props["Start month"] = {
      rich_text: [{ text: { content: String(data.startDate) } }],
    };
  }
  const roleValues = String(data.role || "Off-cycle")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (roleValues.length) {
    props["Role"] = { multi_select: roleValues.map((name) => ({ name })) };
  }
if (data.type) {
    props["Type d'infrastructure"] = {
      rich_text: [{ text: { content: String(data.type) } }],
    };
  }
  if (data.deadline) {
    props["Date de fermeture"] = {
      rich_text: [{ text: { content: String(data.deadline) } }],
    };
  }

  return props;
}

async function upsertToNotion(payload) {
  const { notionToken: token, notionDbId: dbId } = await chrome.storage.sync.get([
    "notionToken",
    "notionDbId",
  ]);

  if (!token || !dbId) throw new Error("Config Notion manquante (Options).");
  const normalizedDbId = normalizeDbId(dbId);
  if (!normalizedDbId) {
    throw new Error("Invalid database ID. Please paste the database URL or ID in Options.");
  }

  const existing = await findByUrl(token, normalizedDbId, payload.url);
  const properties = buildProps(payload);

  if (existing) {
    await notionFetch(token, `pages/${existing.id}`, "PATCH", { properties });
    return { ok: true, mode: "updated" };
  } else {
    await notionFetch(token, "pages", "POST", {
      parent: { database_id: normalizedDbId },
      properties,
    });
    return { ok: true, mode: "created" };
  }
}

function propText(prop) {
  if (!prop) return "";
  if (prop.type === "title") {
    return (prop.title || []).map((t) => t?.plain_text || "").join("").trim();
  }
  if (prop.type === "rich_text") {
    return (prop.rich_text || []).map((t) => t?.plain_text || "").join("").trim();
  }
  if (prop.type === "select") return prop.select?.name || "";
  if (prop.type === "status") return prop.status?.name || "";
  if (prop.type === "multi_select") {
    return (prop.multi_select || []).map((t) => t?.name || "").filter(Boolean).join(", ");
  }
  if (prop.type === "url") return prop.url || "";
  if (prop.type === "date") return prop.date?.start || "";
  if (prop.type === "checkbox") return prop.checkbox ? "true" : "false";
  return "";
}

async function listDbRows(token, dbId, filter) {
  let rows = [];
  let cursor = undefined;

  while (rows.length < MAX_LIST_ROWS) {
    const body = { page_size: 100 };
    if (filter) body.filter = filter;
    if (cursor) body.start_cursor = cursor;
    const r = await notionFetch(token, `databases/${dbId}/query`, "POST", body);
    rows = rows.concat(r.results || []);
    if (!r.has_more || !r.next_cursor) break;
    cursor = r.next_cursor;
  }

  return rows.slice(0, MAX_LIST_ROWS);
}

async function checkDbAndLoad() {
  const { notionToken: token, notionDbId: dbId } = await chrome.storage.sync.get([
    "notionToken",
    "notionDbId",
  ]);

  if (!token || !dbId) throw new Error("Config Notion manquante (Options).");
  const normalizedDbId = normalizeDbId(dbId);
  if (!normalizedDbId) {
    throw new Error("Invalid database ID. Please paste the database URL or ID in Options.");
  }

  const db = await notionFetch(token, `databases/${normalizedDbId}`, "GET");
  const rows = await listDbRows(token, normalizedDbId);

  const mapped = rows.map((r) => {
    const p = r.properties || {};
    return {
      id: r.id,
      title: propText(p["Job Title"]) || propText(p["Name"]) || "",
      company: propText(p["Entreprise"]) || "",
      location: propText(p["Lieu"]) || "",
      url: propText(p["lien offre"]) || "",
      status: propText(p["Status"]) || "",
      role: propText(p["Role"]) || "",
      type: propText(p["Type d'infrastructure"]) || "",
      applicationDate: propText(p["Application Date"]) || "",
      startMonth: propText(p["Start month"]) || "",
      openDate: propText(p["Date d'ouverture"]) || "",
      closeDate: propText(p["Date de fermeture"]) || "",
    };
  });

  const dbTitle = (db.title || []).map((t) => t?.plain_text || "").join("").trim();
  const columns = Object.keys(db.properties || {}).sort((a, b) => a.localeCompare(b));

  return {
    ok: true,
    dbTitle,
    columns,
    rows: mapped,
    total: rows.length,
    capped: rows.length >= MAX_LIST_ROWS,
  };
}

async function listOpenStages() {
  const { notionToken: token, notionDbId: dbId } = await chrome.storage.sync.get([
    "notionToken",
    "notionDbId",
  ]);

  if (!token || !dbId) throw new Error("Config Notion manquante (Options).");
  const normalizedDbId = normalizeDbId(dbId);
  if (!normalizedDbId) {
    throw new Error("Invalid database ID. Please paste the database URL or ID in Options.");
  }

  const db = await notionFetch(token, `databases/${normalizedDbId}`, "GET");
  const statusProp = db.properties?.["Status"];
  if (!statusProp) throw new Error("Colonne Status introuvable dans la base.");

  let filter = null;
  if (statusProp.type === "status") {
    filter = { property: "Status", status: { equals: "Ouvert" } };
  } else if (statusProp.type === "select") {
    filter = { property: "Status", select: { equals: "Ouvert" } };
  } else if (statusProp.type === "rich_text" || statusProp.type === "title") {
    filter = { property: "Status", rich_text: { equals: "Ouvert" } };
  } else {
    throw new Error("Type de colonne Status non supporte pour le filtre.");
  }

  const rows = await listDbRows(token, normalizedDbId, filter);
  const mapped = rows.map((r) => {
    const p = r.properties || {};
    return {
      id: r.id,
      title: propText(p["Job Title"]) || propText(p["Name"]) || "",
      company: propText(p["Entreprise"]) || "",
      url: propText(p["lien offre"]) || "",
      status: propText(p["Status"]) || "",
    };
  });

  return {
    ok: true,
    items: mapped,
    total: rows.length,
    capped: rows.length >= MAX_LIST_ROWS,
  };
}

function buildStatusFilter(statusProp, names) {
  const items = (names || []).filter(Boolean);
  if (items.length === 0) return null;

  if (statusProp.type === "status") {
    return { or: items.map((name) => ({ property: "Status", status: { equals: name } })) };
  }
  if (statusProp.type === "select") {
    return { or: items.map((name) => ({ property: "Status", select: { equals: name } })) };
  }
  if (statusProp.type === "rich_text" || statusProp.type === "title") {
    return { or: items.map((name) => ({ property: "Status", rich_text: { equals: name } })) };
  }
  return null;
}

async function listTodoStages() {
  const { notionToken: token, notionDbId: dbId } = await chrome.storage.sync.get([
    "notionToken",
    "notionDbId",
  ]);

  if (!token || !dbId) throw new Error("Config Notion manquante (Options).");
  const normalizedDbId = normalizeDbId(dbId);
  if (!normalizedDbId) {
    throw new Error("Invalid database ID. Please paste the database URL or ID in Options.");
  }

  const db = await notionFetch(token, `databases/${normalizedDbId}`, "GET");
  const statusProp = db.properties?.["Status"];
  if (!statusProp) throw new Error("Colonne Status introuvable dans la base.");

  const filter = buildStatusFilter(statusProp, ["OA to do", "HV to do"]);
  if (!filter) throw new Error("Type de colonne Status non supporte pour le filtre.");

  const rows = await listDbRows(token, normalizedDbId, filter);
  const mapped = rows.map((r) => {
    const p = r.properties || {};
    return {
      id: r.id,
      title: propText(p["Job Title"]) || propText(p["Name"]) || "",
      company: propText(p["Entreprise"]) || "",
      url: propText(p["lien offre"]) || "",
      status: propText(p["Status"]) || "",
    };
  });

  return {
    ok: true,
    items: mapped,
    total: rows.length,
    capped: rows.length >= MAX_LIST_ROWS,
  };
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === "UPSERT_NOTION") {
    upsertToNotion(msg.payload)
      .then((r) => sendResponse(r))
      .catch((e) => sendResponse({ ok: false, error: e.message }));
    return true;
  }

  if (msg?.type === "CHECK_NOTION_DB") {
    checkDbAndLoad()
      .then((r) => sendResponse(r))
      .catch((e) => sendResponse({ ok: false, error: e.message }));
    return true;
  }

  if (msg?.type === "GET_OPEN_STAGES") {
    listOpenStages()
      .then((r) => sendResponse(r))
      .catch((e) => sendResponse({ ok: false, error: e.message }));
    return true;
  }

  if (msg?.type === "GET_TODO_STAGES") {
    listTodoStages()
      .then((r) => sendResponse(r))
      .catch((e) => sendResponse({ ok: false, error: e.message }));
    return true;
  }

  sendResponse({ ok: false, error: "Message inconnu." });
  return true;
});
