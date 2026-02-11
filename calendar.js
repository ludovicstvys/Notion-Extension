const calendarListEl = document.getElementById("calendar-list");
const notifyListEl = document.getElementById("notify-list");
const calendarStatusEl = document.getElementById("calendar-status");
const eventsEl = document.getElementById("calendar-view");
const eventsStatusEl = document.getElementById("events-status");
const nextEventsEl = document.getElementById("next-events");
const nextStatusEl = document.getElementById("next-status");
const dateEl = document.getElementById("date");
const searchEl = document.getElementById("search");
const calendarFilterEl = document.getElementById("calendar-filter");
const sortSelectEl = document.getElementById("sort-select");
const exportEventsBtn = document.getElementById("export-events");
const exportDiagnosticsBtn = document.getElementById("export-diagnostics");
const refreshBtn = document.getElementById("refresh");
const refreshStatusEl = document.getElementById("refresh-status");
const prevBtn = document.getElementById("prev");
const nextBtn = document.getElementById("next");
const todayBtn = document.getElementById("today");
const createEventBtn = document.getElementById("create-event-btn");
const eventFormCard = document.getElementById("event-form-card");
const eventSummaryEl = document.getElementById("event-summary");
const eventLocationEl = document.getElementById("event-location");
const eventLocationSuggestionsEl = document.getElementById("event-location-suggestions");
const eventLocationStatusEl = document.getElementById("event-location-status");
const eventLocationSpinnerEl = document.getElementById("event-location-spinner");
const eventDescriptionEl = document.getElementById("event-description");
const eventLinkEl = document.getElementById("event-link");
const eventAttendeesEl = document.getElementById("event-attendees");
const eventAttendeesStatusEl = document.getElementById("event-attendees-status");
const eventAttendeesChipsEl = document.getElementById("event-attendees-chips");
const eventStartEl = document.getElementById("event-start");
const eventEndEl = document.getElementById("event-end");
const eventAllDayEl = document.getElementById("event-all-day");
const eventUseMeetEl = document.getElementById("event-use-meet");
const eventSendInvitesEl = document.getElementById("event-send-invites");
const eventSubmitBtn = document.getElementById("event-submit");
const eventCancelBtn = document.getElementById("event-cancel");
const eventFormStatusEl = document.getElementById("event-form-status");
const durationBtns = Array.from(
  document.querySelectorAll("#event-form-card .duration-row [data-duration]")
);
const durationRowEl = document.querySelector("#event-form-card .duration-row");
const tabs = Array.from(document.querySelectorAll(".tab"));
const filterBtns = Array.from(document.querySelectorAll(".filter"));
const datepickerEl = document.getElementById("datepicker");
const dpGridEl = document.getElementById("dp-grid");
const dpTitleEl = document.getElementById("dp-title");
const dpPrevBtn = document.getElementById("dp-prev");
const dpNextBtn = document.getElementById("dp-next");
const dpTimeEl = document.getElementById("dp-time");
const dpHourEl = document.getElementById("dp-hour");
const dpMinuteEl = document.getElementById("dp-minute");
const dpClearBtn = document.getElementById("dp-clear");
const dpTodayBtn = document.getElementById("dp-today");

let calendars = [];
let selectedIds = [];
let viewMode = "day";
let meetingFilter = "all";
let notifyIds = [];
let isEventFormOpen = false;
let isSubmittingEvent = false;
let attendeeChips = [];
let editingEvent = null;
let locationSuggestTimeoutId = null;
let selectedLocationInfo = null;
let calendarFilterId = "all";
let sortMode = "start-asc";
let lastEvents = [];
const CAL_LAST_REFRESH_KEY = "calendarLastRefresh";
const EXTERNAL_ICAL_URL_KEY = "externalIcalUrl";
const EXTERNAL_ICAL_CAL_ID = "external-ical";
const EXTERNAL_ICAL_CAL_NAME = "Calendrier externe (iCal)";
const EXTERNAL_ICAL_CAL_COLOR = "#14b8a6";
let activeDateInput = null;
let activePickerMode = "date";
let dpMonth = new Date();
let eventPopoverEl = null;
let eventPopoverHideTimer = null;

function todayLocalDateInput() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function normalizeText(input) {
  const text = (input ?? "").toString();
  return text.normalize("NFC").trim();
}

function parseIcalParams(parts) {
  const params = {};
  parts.forEach((part) => {
    const idx = part.indexOf("=");
    if (idx === -1) return;
    const key = part.slice(0, idx).trim().toUpperCase();
    const value = part.slice(idx + 1).trim();
    if (!key) return;
    params[key] = value;
  });
  return params;
}

function unfoldIcalLines(icsText) {
  const raw = String(icsText || "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n");
  const lines = [];
  raw.forEach((line) => {
    if ((line.startsWith(" ") || line.startsWith("\t")) && lines.length > 0) {
      lines[lines.length - 1] += line.slice(1);
    } else {
      lines.push(line);
    }
  });
  return lines;
}

function unescapeIcalText(value) {
  return String(value || "")
    .replace(/\\n/gi, "\n")
    .replace(/\\,/g, ",")
    .replace(/\\;/g, ";")
    .replace(/\\\\/g, "\\");
}

function parseIcalDateValue(value, params = {}) {
  const raw = String(value || "").trim();
  if (!raw) return { value: "", date: null, allDay: false };

  const isDateOnly = String(params.VALUE || "").toUpperCase() === "DATE" || /^\d{8}$/.test(raw);
  if (isDateOnly) {
    const m = raw.match(/^(\d{4})(\d{2})(\d{2})$/);
    if (!m) return { value: "", date: null, allDay: true };
    const y = Number.parseInt(m[1], 10);
    const mon = Number.parseInt(m[2], 10);
    const d = Number.parseInt(m[3], 10);
    const date = new Date(y, mon - 1, d);
    if (Number.isNaN(date.getTime())) return { value: "", date: null, allDay: true };
    return {
      value: `${y}-${String(mon).padStart(2, "0")}-${String(d).padStart(2, "0")}`,
      date,
      allDay: true,
    };
  }

  const m = raw.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})?(Z)?$/);
  if (!m) return { value: "", date: null, allDay: false };
  const y = Number.parseInt(m[1], 10);
  const mon = Number.parseInt(m[2], 10);
  const d = Number.parseInt(m[3], 10);
  const h = Number.parseInt(m[4], 10);
  const min = Number.parseInt(m[5], 10);
  const s = Number.parseInt(m[6] || "0", 10);
  const utc = m[7] === "Z";
  const date = utc
    ? new Date(Date.UTC(y, mon - 1, d, h, min, s))
    : new Date(y, mon - 1, d, h, min, s);
  if (Number.isNaN(date.getTime())) return { value: "", date: null, allDay: false };
  return { value: date.toISOString(), date, allDay: false };
}

function parseIcalEvents(icsText) {
  const lines = unfoldIcalLines(icsText);
  const events = [];
  let current = null;

  lines.forEach((line) => {
    const text = String(line || "");
    if (!text) return;
    if (text === "BEGIN:VEVENT") {
      current = {};
      return;
    }
    if (text === "END:VEVENT") {
      if (!current) return;
      const startParsed = parseIcalDateValue(current.dtstart, current.dtstartParams);
      if (!startParsed.value || !startParsed.date) {
        current = null;
        return;
      }
      const endParsed = parseIcalDateValue(current.dtend, current.dtendParams);
      const endValue = endParsed.value || startParsed.value;
      const idBase = current.uid || `${startParsed.value}|${current.summary || "event"}`;
      const safeId = idBase.replace(/[^\w.-]+/g, "_");
      events.push({
        id: `ical-${safeId}`,
        start: startParsed.value,
        end: endValue,
        startMs: startParsed.date.getTime(),
        summary: unescapeIcalText(current.summary || "Evenement"),
        location: unescapeIcalText(current.location || ""),
        description: unescapeIcalText(current.description || ""),
        url: normalizeUrl(current.url || ""),
      });
      current = null;
      return;
    }
    if (!current) return;

    const idx = text.indexOf(":");
    if (idx === -1) return;
    const rawKey = text.slice(0, idx);
    const rawValue = text.slice(idx + 1);
    const [name, ...paramParts] = rawKey.split(";");
    const key = String(name || "").toUpperCase();
    const params = parseIcalParams(paramParts);

    if (key === "UID") current.uid = rawValue;
    if (key === "SUMMARY") current.summary = rawValue;
    if (key === "LOCATION") current.location = rawValue;
    if (key === "DESCRIPTION") current.description = rawValue;
    if (key === "URL") current.url = rawValue;
    if (key === "DTSTART") {
      current.dtstart = rawValue;
      current.dtstartParams = params;
    }
    if (key === "DTEND") {
      current.dtend = rawValue;
      current.dtendParams = params;
    }
  });

  return events;
}

function sendRuntimeMessage(message) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(message, (res) => {
      if (chrome.runtime.lastError) {
        resolve({ ok: false, error: chrome.runtime.lastError.message });
        return;
      }
      resolve(res || { ok: false, error: "inconnue" });
    });
  });
}

async function loadGoogleEventsSafe(timeMin, timeMax, calendarIds) {
  if (!Array.isArray(calendarIds) || calendarIds.length === 0) {
    return { ok: true, events: [] };
  }
  const res = await sendRuntimeMessage({
    type: "GCAL_LOAD_EVENTS",
    payload: { timeMin, timeMax, calendarIds },
  });
  if (!res?.ok) {
    const error = res?.error || "inconnue";
    return { ok: false, error, authRequired: error === "AUTH_REQUIRED", events: [] };
  }
  return { ok: true, events: Array.isArray(res.events) ? res.events : [] };
}

async function loadExternalIcalEventsSafe(timeMin, timeMax) {
  const data = await chrome.storage.local.get([EXTERNAL_ICAL_URL_KEY]);
  const sourceUrl = normalizeUrl(data?.[EXTERNAL_ICAL_URL_KEY] || "");
  if (!sourceUrl) return { ok: true, hasSource: false, events: [] };

  try {
    const res = await fetch(sourceUrl, { cache: "no-store" });
    if (!res.ok) {
      return {
        ok: false,
        hasSource: true,
        events: [],
        error: `Flux iCal indisponible (HTTP ${res.status}).`,
      };
    }
    const text = await res.text();
    const parsed = parseIcalEvents(text);
    const minMs = new Date(timeMin).getTime();
    const maxMs = new Date(timeMax).getTime();
    const events = parsed
      .filter((ev) => Number.isFinite(ev.startMs) && ev.startMs >= minMs && ev.startMs <= maxMs)
      .map((ev) => ({
        id: ev.id,
        summary: ev.summary || "Evenement",
        location: ev.location || "",
        start: ev.start,
        end: ev.end,
        calendarId: EXTERNAL_ICAL_CAL_ID,
        calendarSummary: EXTERNAL_ICAL_CAL_NAME,
        htmlLink: sourceUrl,
        sourceUrl: ev.url || sourceUrl,
        description: ev.description || "",
        attendees: [],
        meetingLink: ev.url || "",
        sourceType: "ical",
        eventType: detectEventType(ev),
        tags: [],
        readOnly: true,
      }));
    return { ok: true, hasSource: true, events };
  } catch (err) {
    return {
      ok: false,
      hasSource: true,
      events: [],
      error: err?.message || "Erreur lors du chargement du flux iCal.",
    };
  }
}

async function loadCombinedEvents(timeMin, timeMax, calendarIds) {
  const [google, external] = await Promise.all([
    loadGoogleEventsSafe(timeMin, timeMax, calendarIds),
    loadExternalIcalEventsSafe(timeMin, timeMax),
  ]);
  const events = [...(google.events || []), ...(external.events || [])].sort(
    (a, b) => new Date(a.start) - new Date(b.start)
  );
  return { google, external, events };
}

async function setCalendarFilterOptionsWithExternal(googleItems) {
  const items = Array.isArray(googleItems) ? [...googleItems] : [];
  const data = await chrome.storage.local.get([EXTERNAL_ICAL_URL_KEY]);
  const sourceUrl = normalizeUrl(data?.[EXTERNAL_ICAL_URL_KEY] || "");
  if (sourceUrl) {
    items.push({
      id: EXTERNAL_ICAL_CAL_ID,
      summary: EXTERNAL_ICAL_CAL_NAME,
      backgroundColor: EXTERNAL_ICAL_CAL_COLOR,
    });
  }
  setCalendarFilterOptions(items);
}

function toDateTimeLocalValue(date) {
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${y}-${m}-${day}T${hh}:${mm}`;
}

function parseDateTimeLocal(value) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function formatDateFr(date) {
  if (!date) return "";
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function formatDateTimeFr(date) {
  if (!date) return "";
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getInputIsoValue(inputEl) {
  if (!inputEl) return "";
  return inputEl.dataset?.iso || inputEl.value || "";
}

function setInputDateValue(inputEl, date, mode, silent = false) {
  if (!inputEl) return;
  if (!date) {
    inputEl.value = "";
    inputEl.dataset.iso = "";
    if (!silent) inputEl.dispatchEvent(new Event("change"));
    return;
  }
  if (mode === "datetime") {
    const iso = toDateTimeLocalValue(date);
    inputEl.dataset.iso = iso;
    inputEl.value = formatDateTimeFr(date);
  } else {
    const iso = toDateOnlyValue(date);
    inputEl.dataset.iso = iso;
    inputEl.value = formatDateFr(date);
  }
  if (!silent) inputEl.dispatchEvent(new Event("change"));
}
function collectAttendees(value) {
  return String(value || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || "").trim());
}

function setEventFormStatus(message, type) {
  if (!eventFormStatusEl) return;
  eventFormStatusEl.textContent = message || "";
  eventFormStatusEl.classList.remove("status-ok", "status-error");
  if (type === "ok") eventFormStatusEl.classList.add("status-ok");
  if (type === "error") eventFormStatusEl.classList.add("status-error");
}

function setSubmittingEventForm(nextSubmitting) {
  isSubmittingEvent = !!nextSubmitting;
  if (eventSubmitBtn) {
    eventSubmitBtn.disabled = isSubmittingEvent;
    eventSubmitBtn.textContent = isSubmittingEvent ? "Création..." : "Créer l’événement";
  }
}

function setAttendeesStatus(text, type) {
  if (!eventAttendeesStatusEl) return;
  eventAttendeesStatusEl.textContent = text || "";
  eventAttendeesStatusEl.classList.remove("status-ok", "status-error");
  if (type === "ok") eventAttendeesStatusEl.classList.add("status-ok");
  if (type === "error") eventAttendeesStatusEl.classList.add("status-error");
}

function renderAttendeeChips() {
  if (!eventAttendeesChipsEl) return;
  eventAttendeesChipsEl.innerHTML = "";
  attendeeChips.forEach((email) => {
    const chip = document.createElement("div");
    chip.className = "attendee-chip";
    chip.textContent = email;

    const del = document.createElement("button");
    del.type = "button";
    del.setAttribute("aria-label", `Supprimer ${email}`);
    del.textContent = "×";
    del.addEventListener("click", () => {
      attendeeChips = attendeeChips.filter((e) => e !== email);
      renderAttendeeChips();
      verifyAttendeesField();
    });

    chip.appendChild(del);
    eventAttendeesChipsEl.appendChild(chip);
  });
}

function verifyAttendeesField() {
  if (!eventAttendeesEl) return { attendees: [], invalid: [] };
  const typed = collectAttendees(eventAttendeesEl.value);
  const attendees = Array.from(new Set([...attendeeChips, ...typed]));
  const invalid = attendees.filter((email) => !isValidEmail(email));

  eventAttendeesEl.classList.remove("attendees-valid", "attendees-invalid");
  if (!attendees.length) {
    setAttendeesStatus("", null);
    return { attendees, invalid };
  }
  if (invalid.length) {
    eventAttendeesEl.classList.add("attendees-invalid");
    setAttendeesStatus(`Emails invalides: ${invalid.slice(0, 3).join(", ")}`, "error");
  } else {
    eventAttendeesEl.classList.add("attendees-valid");
    setAttendeesStatus(`${attendees.length} invité(s) vérifié(s).`, "ok");
  }
  return { attendees, invalid };
}

function addAttendeeFromInput() {
  if (!eventAttendeesEl) return;
  const value = normalizeText(eventAttendeesEl.value);
  if (!value) return;
  const emails = collectAttendees(value);
  let added = 0;
  emails.forEach((email) => {
    if (!isValidEmail(email)) return;
    if (attendeeChips.includes(email)) return;
    attendeeChips.push(email);
    added += 1;
  });
  eventAttendeesEl.value = "";
  if (added > 0) {
    renderAttendeeChips();
  }
  verifyAttendeesField();
}

function clearAttendeesField() {
  attendeeChips = [];
  if (eventAttendeesEl) eventAttendeesEl.value = "";
  renderAttendeeChips();
  setAttendeesStatus("", null);
  eventAttendeesEl?.classList.remove("attendees-valid", "attendees-invalid");
}

function setLocationStatus(message, type) {
  if (!eventLocationStatusEl) return;
  eventLocationStatusEl.textContent = message || "";
  eventLocationStatusEl.classList.remove("status-ok", "status-error");
  if (type === "ok") eventLocationStatusEl.classList.add("status-ok");
  if (type === "error") eventLocationStatusEl.classList.add("status-error");
}

function setLocationValidityClass(type) {
  if (!eventLocationEl) return;
  eventLocationEl.classList.remove("location-valid", "location-invalid");
  if (type === "ok") eventLocationEl.classList.add("location-valid");
  if (type === "error") eventLocationEl.classList.add("location-invalid");
}

function setLocationLoading(isLoading) {
  if (!eventLocationSpinnerEl) return;
  eventLocationSpinnerEl.classList.toggle("visible", !!isLoading);
}

function isLocationValidated() {
  const address = normalizeText(eventLocationEl?.value || "");
  if (!address) return true;
  if (eventLocationEl?.classList.contains("location-valid")) return true;
  if (selectedLocationInfo && (selectedLocationInfo.lat != null || selectedLocationInfo.lng != null)) {
    return true;
  }
  return false;
}

function hideLocationSuggestions() {
  if (!eventLocationSuggestionsEl) return;
  eventLocationSuggestionsEl.classList.remove("visible");
  eventLocationSuggestionsEl.innerHTML = "";
}

function showLocationSuggestions(items) {
  if (!eventLocationSuggestionsEl) return;
  eventLocationSuggestionsEl.innerHTML = "";
  if (!items || items.length === 0) {
    eventLocationSuggestionsEl.classList.remove("visible");
    return;
  }
  items.slice(0, 6).forEach((item) => {
    const row = document.createElement("div");
    row.className = "location-suggestion";
    row.textContent = item.description || "";
    row.addEventListener("mousedown", (e) => {
      // mousedown fires before blur; prevent losing the click.
      e.preventDefault();
      pickLocationSuggestion(item);
    });
    eventLocationSuggestionsEl.appendChild(row);
  });
  eventLocationSuggestionsEl.classList.add("visible");
}

function pickLocationSuggestion(item) {
  if (!eventLocationEl) return;
  const text = item?.description || "";
  eventLocationEl.value = text;
  selectedLocationInfo = item || null;
  hideLocationSuggestions();
  setLocationLoading(false);
  setLocationValidityClass("ok");
  setLocationStatus("Adresse suggérée validée.", "ok");
}

function debounceLocationSuggestions(query) {
  if (locationSuggestTimeoutId) clearTimeout(locationSuggestTimeoutId);
  if (!query || query.length < 3) {
    hideLocationSuggestions();
    setLocationLoading(false);
    return;
  }
  setLocationLoading(true);
  locationSuggestTimeoutId = setTimeout(() => {
    chrome.runtime.sendMessage(
      { type: "PLACES_AUTOCOMPLETE", payload: { input: query } },
      (res) => {
        setLocationLoading(false);
        if (chrome.runtime.lastError) return;
        if (!res?.ok) {
          if (res?.code === "PLACES_KEY_MISSING") {
            setLocationStatus("Ajoute une clé Google Places dans Options.", "error");
            setLocationValidityClass("error");
          } else {
            const msg = res?.error || "";
            if (msg) setLocationStatus(msg, "error");
          }
          hideLocationSuggestions();
          return;
        }
        showLocationSuggestions(res.items || []);
      }
    );
  }, 180);
}

function geocodeLocationOnBlur() {
  const address = normalizeText(eventLocationEl?.value || "");
  if (!address) {
    setLocationStatus("", null);
    setLocationValidityClass(null);
    hideLocationSuggestions();
    selectedLocationInfo = null;
    setLocationLoading(false);
    return;
  }
  setLocationLoading(true);
  chrome.runtime.sendMessage(
    { type: "PLACES_GEOCODE", payload: { address } },
    (res) => {
      setLocationLoading(false);
      if (chrome.runtime.lastError) return;
      if (!res?.ok) {
        if (res?.code === "PLACES_KEY_MISSING") {
          setLocationStatus("Ajoute une clé Google Places dans Options.", "error");
        } else {
          setLocationStatus(res?.error || "Adresse non vérifiée.", "error");
        }
        setLocationValidityClass("error");
        return;
      }
      if (!res.result) {
        setLocationStatus("Adresse non trouvée.", "error");
        setLocationValidityClass("error");
        return;
      }
      selectedLocationInfo = {
        description: res.result.formattedAddress || address,
        lat: res.result.lat,
        lng: res.result.lng,
      };
      if (eventLocationEl && res.result.formattedAddress) {
        eventLocationEl.value = res.result.formattedAddress;
      }
      setLocationStatus("Adresse vérifiée.", "ok");
      setLocationValidityClass("ok");
    }
  );
}

function resetEventFormAfterSuccess(message) {
  editingEvent = null;
  if (eventSummaryEl) eventSummaryEl.value = "";
  if (eventLocationEl) eventLocationEl.value = "";
  if (eventDescriptionEl) eventDescriptionEl.value = "";
  if (eventLinkEl) eventLinkEl.value = "";
  if (eventUseMeetEl) eventUseMeetEl.checked = false;
  if (eventSendInvitesEl) eventSendInvitesEl.checked = true;
  clearAttendeesField();
  hideLocationSuggestions();
  selectedLocationInfo = null;
  setLocationLoading(false);
  setLocationStatus("", null);
  setLocationValidityClass(null);
  prefillEventForm();
  setEventFormStatus(message || "Opération réussie.", "ok");
  toggleEventForm(false);
}

function buildMeetConferenceData() {
  const requestId =
    (typeof crypto !== "undefined" && crypto.randomUUID && crypto.randomUUID()) ||
    `meet-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return {
    createRequest: {
      requestId,
      conferenceSolutionKey: { type: "hangoutsMeet" },
    },
  };
}

function prefillFormFromEvent(ev) {
  if (!ev) return;
  if (eventSummaryEl) eventSummaryEl.value = ev.summary || "";
  if (eventLocationEl) {
    eventLocationEl.value = ev.location || "";
    if (normalizeText(ev.location || "")) {
      selectedLocationInfo = { description: ev.location || "", lat: null, lng: null };
      setLocationValidityClass("ok");
      setLocationStatus("Adresse existante (non revalidée).", null);
    } else {
      selectedLocationInfo = null;
      setLocationValidityClass(null);
      setLocationStatus("", null);
    }
  }
  if (eventDescriptionEl) eventDescriptionEl.value = ev.description || "";
  if (eventLinkEl) eventLinkEl.value = ev.sourceUrl || "";

  if (eventAllDayEl) {
    const isAllDay = typeof ev.start === "string" && ev.start.length === 10;
    eventAllDayEl.checked = isAllDay;
    applyAllDayMode(isAllDay);
  }

  const start = ev.start ? new Date(ev.start) : null;
  const end = ev.end ? new Date(ev.end) : null;
  if (start && !Number.isNaN(start.getTime()) && eventStartEl) {
    if (eventAllDayEl?.checked) {
      setInputDateValue(eventStartEl, start, "date");
    } else {
      setInputDateValue(eventStartEl, start, "datetime");
    }
  }
  if (end && !Number.isNaN(end.getTime()) && eventEndEl) {
    if (eventAllDayEl?.checked) {
      const endInclusive = new Date(end);
      endInclusive.setDate(endInclusive.getDate() - 1);
      setInputDateValue(eventEndEl, endInclusive, "date");
    } else {
      setInputDateValue(eventEndEl, end, "datetime");
    }
  }

  clearAttendeesField();
  const emails = Array.isArray(ev.attendees) ? ev.attendees.filter(isValidEmail) : [];
  if (emails.length) {
    attendeeChips = Array.from(new Set(emails));
    renderAttendeeChips();
    verifyAttendeesField();
  }

  if (eventUseMeetEl) {
    eventUseMeetEl.checked = /meet\.google\.com/i.test(ev.meetingLink || "");
  }
}

function startEditingEvent(ev) {
  if (ev?.readOnly) {
    setEventFormStatus("Evenement iCal en lecture seule.", "error");
    return;
  }
  editingEvent = ev;
  toggleEventForm(true);
  hideLocationSuggestions();
  setLocationLoading(false);
  prefillFormFromEvent(ev);
  setEventFormStatus("Mode modification.", null);
  if (eventSummaryEl) eventSummaryEl.focus();
}

function applyDurationFromStart(minutes) {
  if (!eventStartEl || !eventEndEl) return;
  if (eventAllDayEl?.checked) return;
  const start = parseDateTimeLocal(getInputIsoValue(eventStartEl));
  if (!start) return;
  const end = new Date(start);
  end.setMinutes(end.getMinutes() + minutes);
  setInputDateValue(eventEndEl, end, "datetime");
}

function toggleEventForm(forceOpen) {
  if (!eventFormCard) return;
  const nextOpen = typeof forceOpen === "boolean" ? forceOpen : !isEventFormOpen;
  isEventFormOpen = nextOpen;
  eventFormCard.classList.toggle("form-hidden", !nextOpen);
  if (createEventBtn) {
    createEventBtn.textContent = nextOpen ? "Fermer le formulaire" : "Créer un événement";
  }
}

function applyAllDayMode(isAllDay) {
  if (!eventStartEl || !eventEndEl) return;
  if (durationRowEl) durationRowEl.style.display = isAllDay ? "none" : "";

  if (isAllDay) {
    const start = parseDateTimeLocal(getInputIsoValue(eventStartEl)) || parseDateOnly(getInputIsoValue(eventStartEl));
    const end = parseDateTimeLocal(getInputIsoValue(eventEndEl)) || parseDateOnly(getInputIsoValue(eventEndEl));
    if (start) setInputDateValue(eventStartEl, start, "date");
    if (end) setInputDateValue(eventEndEl, end, "date");
    eventStartEl.dataset.picker = "date";
    eventEndEl.dataset.picker = "date";
    if (eventStartEl && !getInputIsoValue(eventStartEl)) {
      setInputDateValue(eventStartEl, new Date(), "date");
    }
    if (eventEndEl && !getInputIsoValue(eventEndEl)) {
      const base = parseDateOnly(getInputIsoValue(eventStartEl)) || new Date();
      setInputDateValue(eventEndEl, base, "date");
    }
  } else {
    eventStartEl.dataset.picker = "datetime";
    eventEndEl.dataset.picker = "datetime";
    const startDate = parseDateOnly(getInputIsoValue(eventStartEl)) || new Date();
    startDate.setHours(9, 0, 0, 0);
    const endDate = new Date(startDate);
    endDate.setHours(startDate.getHours() + 1);
    setInputDateValue(eventStartEl, startDate, "datetime");
    setInputDateValue(eventEndEl, endDate, "datetime");
  }
}

function prefillEventForm() {
  if (!eventStartEl || !eventEndEl) return;
  if (eventAllDayEl) eventAllDayEl.checked = false;
  applyAllDayMode(false);
  const base = parseDateInput(getInputIsoValue(dateEl));
  base.setHours(9, 0, 0, 0);
  const end = new Date(base);
  end.setHours(base.getHours() + 1);
  setInputDateValue(eventStartEl, base, "datetime");
  setInputDateValue(eventEndEl, end, "datetime");
}

async function pickCalendarId() {
  const { gcalDefaultCalendar } = await chrome.storage.local.get(["gcalDefaultCalendar"]);
  const writableIds = new Set(
    calendars
      .filter((c) => c.accessRole === "owner" || c.accessRole === "writer")
      .map((c) => c.id)
  );

  if (writableIds.size === 0) {
    throw new Error("Aucun calendrier inscriptible (owner/writer) trouvé.");
  }

  if (gcalDefaultCalendar && writableIds.has(gcalDefaultCalendar)) {
    return gcalDefaultCalendar;
  }

  const selectedWritable = selectedIds.find((id) => writableIds.has(id));
  if (selectedWritable) return selectedWritable;

  if (writableIds.has("primary")) return "primary";
  const firstWritable = calendars.find(
    (c) => c.accessRole === "owner" || c.accessRole === "writer"
  );
  return firstWritable?.id || "primary";
}

async function submitCreateEvent() {
  if (isSubmittingEvent) return;
  const summary = normalizeText(eventSummaryEl?.value || "");
  if (!summary) {
    setEventFormStatus("Titre obligatoire.", "error");
    return;
  }

  const isAllDay = !!eventAllDayEl?.checked;
  const start = isAllDay ? parseDateOnly(getInputIsoValue(eventStartEl)) : parseDateTimeLocal(getInputIsoValue(eventStartEl));
  const end = isAllDay ? parseDateOnly(getInputIsoValue(eventEndEl)) : parseDateTimeLocal(getInputIsoValue(eventEndEl));
  if (!start || (!isAllDay && end && end <= start)) {
    setEventFormStatus("Dates invalides.", "error");
    return;
  }
  if (isAllDay) {
    if (!end || end < start) {
      if (eventEndEl) setInputDateValue(eventEndEl, start, "date");
    }
  }

  const { attendees, invalid: invalidEmails } = verifyAttendeesField();
  if (invalidEmails.length) {
    setEventFormStatus(`Emails invalides: ${invalidEmails.slice(0, 3).join(", ")}`, "error");
    return;
  }

  const linkRaw = normalizeText(eventLinkEl?.value || "");
  const linkUrl = linkRaw ? normalizeUrl(linkRaw) : "";
  if (linkRaw && !linkUrl) {
    setEventFormStatus("Lien invalide (URL).", "error");
    return;
  }

  const locationText = normalizeText(eventLocationEl?.value || "");
  if (locationText && !isLocationValidated()) {
    setEventFormStatus(
      "Lieu non vérifié. Sélectionne une suggestion ou vérifie l’adresse.",
      "error"
    );
    setLocationStatus("Adresse non vérifiée.", "error");
    setLocationValidityClass("error");
    return;
  }

  setSubmittingEventForm(true);
  setEventFormStatus("Création en cours...", null);
  let calendarId;
  try {
    calendarId = await pickCalendarId();
  } catch (err) {
    setSubmittingEventForm(false);
    setEventFormStatus(err?.message || "Calendrier non inscriptible.", "error");
    return;
  }
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  const sendUpdates = eventSendInvitesEl?.checked ? "all" : "none";

  let startPayload;
  let endPayload;
  let reminders = null;
  if (isAllDay) {
    const endDateInclusive = end && end >= start ? end : new Date(start);
    const endDateExclusive = new Date(endDateInclusive);
    endDateExclusive.setDate(endDateExclusive.getDate() + 1);
    startPayload = { date: toDateOnlyValue(start) };
    endPayload = { date: toDateOnlyValue(endDateExclusive) };
  } else {
    startPayload = { dateTime: start.toISOString(), timeZone };
    if (end) {
      endPayload = { dateTime: end.toISOString(), timeZone };
    } else {
      const reminderEnd = new Date(start);
      reminderEnd.setMinutes(reminderEnd.getMinutes() + 15);
      endPayload = { dateTime: reminderEnd.toISOString(), timeZone };
      reminders = { useDefault: false, overrides: [{ method: "popup", minutes: 0 }] };
    }
  }

  const payload = {
    summary,
    location: normalizeText(eventLocationEl?.value || ""),
    description: normalizeText(eventDescriptionEl?.value || ""),
    start: startPayload,
    end: endPayload,
    attendees,
    useMeet: !!eventUseMeetEl?.checked,
    sendUpdates,
    ...(reminders ? { reminders } : {}),
    ...(linkUrl ? { source: { title: "Lien", url: linkUrl } } : {}),
  };

  if (editingEvent?.id && editingEvent?.calendarId) {
    const patch = {
      summary: payload.summary,
      location: payload.location,
      description: payload.description,
      start: payload.start,
      end: payload.end,
      attendees: payload.attendees.map((email) => ({ email })),
    };
    if (payload.useMeet) {
      patch.conferenceData = buildMeetConferenceData();
    } else {
      patch.conferenceData = null;
    }
    patch.source = linkUrl ? { title: "Lien", url: linkUrl } : null;
    chrome.runtime.sendMessage(
      {
        type: "GCAL_UPDATE_EVENT",
        payload: {
          calendarId: editingEvent.calendarId,
          eventId: editingEvent.id,
          patch,
          sendUpdates,
        },
      },
      (res) => {
        setSubmittingEventForm(false);
        if (chrome.runtime.lastError) {
          setEventFormStatus(`Erreur: ${chrome.runtime.lastError.message}`, "error");
          return;
        }
        if (!res?.ok) {
          setEventFormStatus(`Erreur: ${res?.error || "inconnue"}`, "error");
          return;
        }
        resetEventFormAfterSuccess("Événement mis à jour.");
        loadEvents();
        loadNextEvents();
      }
    );
    return;
  }

  chrome.runtime.sendMessage(
    {
      type: "GCAL_CREATE_EVENT_WITH_INVITES",
      payload: { calendarId, event: payload },
    },
    (res) => {
      if (chrome.runtime.lastError) {
        setSubmittingEventForm(false);
        setEventFormStatus(`Erreur: ${chrome.runtime.lastError.message}`, "error");
        return;
      }
      if (!res?.ok) {
        setSubmittingEventForm(false);
        setEventFormStatus(`Erreur: ${res?.error || "inconnue"}`, "error");
        return;
      }
      setSubmittingEventForm(false);
      resetEventFormAfterSuccess("Événement créé.");
      loadEvents();
      loadNextEvents();
    }
  );
}

function parseDateInput(value) {
  if (!value) return new Date();
  const [y, m, d] = value.split("-").map((v) => Number.parseInt(v, 10));
  return new Date(y, m - 1, d);
}

function parseDateOnly(value) {
  if (!value) return null;
  const [y, m, d] = value.split("-").map((v) => Number.parseInt(v, 10));
  const date = new Date(y, m - 1, d);
  return Number.isNaN(date.getTime()) ? null : date;
}

function normalizeUrl(value) {
  const raw = normalizeText(value || "");
  if (!raw) return "";
  try {
    const url = new URL(raw);
    return url.toString();
  } catch (_) {
    return "";
  }
}

function formatLinkLabel(urlValue) {
  if (!urlValue) return "";
  try {
    const url = new URL(urlValue);
    return `${url.origin}/`;
  } catch (_) {
    return "";
  }
}

function rangeForView(date, mode) {
  const start = new Date(date);
  const end = new Date(date);

  if (mode === "week" || mode === "agenda") {
    const day = start.getDay();
    const diff = (day + 6) % 7; // monday start
    start.setDate(start.getDate() - diff);
    end.setDate(start.getDate() + 7);
  } else if (mode === "month") {
    start.setDate(1);
    end.setMonth(start.getMonth() + 1, 1);
  } else {
    end.setDate(start.getDate() + 1);
  }

  return { timeMin: start.toISOString(), timeMax: end.toISOString() };
}

function setDateInput(date) {
  setInputDateValue(dateEl, date, "date");
}

function formatShortDateTime(ts) {
  if (!ts) return "";
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString();
}

function setRefreshStatus(ts) {
  if (!refreshStatusEl) return;
  refreshStatusEl.textContent = ts ? `Dernier refresh: ${formatShortDateTime(ts)}` : "";
}

function updateLastRefresh(ts) {
  const value = ts || Date.now();
  chrome.storage.local.set({ [CAL_LAST_REFRESH_KEY]: value });
setRefreshStatus(value);
}

setupDatepicker();

function toDateOnlyValue(date) {
  if (!(date instanceof Date)) return "";
  return dateKey(date);
}

function setDatepickerPosition(target) {
  if (!datepickerEl || !target) return;
  const rect = target.getBoundingClientRect();
  const top = rect.bottom + 8;
  const left = Math.min(window.innerWidth - 280, Math.max(12, rect.left));
  datepickerEl.style.top = `${top}px`;
  datepickerEl.style.left = `${left}px`;
}

function setDatepickerOpen(open) {
  if (!datepickerEl) return;
  datepickerEl.classList.toggle("open", !!open);
  datepickerEl.setAttribute("aria-hidden", open ? "false" : "true");
}

function buildDayGrid(baseDate, selectedDate) {
  if (!dpGridEl) return;
  dpGridEl.innerHTML = "";
  const year = baseDate.getFullYear();
  const month = baseDate.getMonth();
  const first = new Date(year, month, 1);
  const start = weekStart(first);
  const todayKey = todayLocalDateInput();
  const selectedKey = selectedDate ? dateKey(selectedDate) : "";

  for (let i = 0; i < 42; i += 1) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "dp-day";
    if (d.getMonth() !== month) btn.classList.add("out");
    if (dateKey(d) === todayKey) btn.classList.add("today");
    if (selectedKey && dateKey(d) === selectedKey) btn.classList.add("selected");
    btn.textContent = String(d.getDate());
    btn.addEventListener("click", () => {
      pickDate(d);
    });
    dpGridEl.appendChild(btn);
  }
}

function formatMonthTitle(date) {
  return date.toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
}

function pickDate(date) {
  if (!activeDateInput) return;
  if (activePickerMode === "datetime") {
    const hour = Number.parseInt(dpHourEl?.value || "9", 10);
    const minute = Number.parseInt(dpMinuteEl?.value || "0", 10);
    const next = new Date(date);
    next.setHours(hour, minute, 0, 0);
    setInputDateValue(activeDateInput, next, "datetime");
  } else {
    setInputDateValue(activeDateInput, date, "date");
  }
  setDatepickerOpen(false);
}

function syncTimeSelectors(value) {
  if (!dpHourEl || !dpMinuteEl) return;
  let hour = 9;
  let minute = 0;
  const parsed = parseDateTimeLocal(value);
  if (parsed) {
    hour = parsed.getHours();
    minute = parsed.getMinutes();
  }
  dpHourEl.value = String(hour).padStart(2, "0");
  dpMinuteEl.value = String(minute).padStart(2, "0");
}

function openDatepicker(inputEl) {
  if (!datepickerEl || !inputEl) return;
  activeDateInput = inputEl;
  activePickerMode = inputEl.dataset.picker === "datetime" ? "datetime" : "date";
  const currentDate =
    activePickerMode === "datetime"
      ? parseDateTimeLocal(getInputIsoValue(inputEl)) || new Date()
      : parseDateOnly(getInputIsoValue(inputEl)) || new Date();
  dpMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
  if (dpTitleEl) dpTitleEl.textContent = formatMonthTitle(dpMonth);
  if (dpTimeEl) dpTimeEl.style.display = activePickerMode === "datetime" ? "flex" : "none";
  if (activePickerMode === "datetime") {
    syncTimeSelectors(getInputIsoValue(inputEl));
  }
  buildDayGrid(dpMonth, currentDate);
  setDatepickerPosition(inputEl);
  setDatepickerOpen(true);
}

function closeDatepicker() {
  setDatepickerOpen(false);
  activeDateInput = null;
}

function setupDatepicker() {
  if (!datepickerEl) return;
  if (dpHourEl && dpHourEl.options.length === 0) {
    for (let h = 0; h < 24; h += 1) {
      const opt = document.createElement("option");
      opt.value = String(h).padStart(2, "0");
      opt.textContent = String(h).padStart(2, "0");
      dpHourEl.appendChild(opt);
    }
  }
  if (dpMinuteEl && dpMinuteEl.options.length === 0) {
    for (let m = 0; m < 60; m += 5) {
      const opt = document.createElement("option");
      opt.value = String(m).padStart(2, "0");
      opt.textContent = String(m).padStart(2, "0");
      dpMinuteEl.appendChild(opt);
    }
  }

  dpPrevBtn?.addEventListener("click", () => {
    dpMonth = new Date(dpMonth.getFullYear(), dpMonth.getMonth() - 1, 1);
    if (dpTitleEl) dpTitleEl.textContent = formatMonthTitle(dpMonth);
    const selected = activeDateInput
      ? parseDateOnly(activeDateInput.value) || parseDateTimeLocal(activeDateInput.value)
      : null;
    buildDayGrid(dpMonth, selected);
  });
  dpNextBtn?.addEventListener("click", () => {
    dpMonth = new Date(dpMonth.getFullYear(), dpMonth.getMonth() + 1, 1);
    if (dpTitleEl) dpTitleEl.textContent = formatMonthTitle(dpMonth);
    const selected = activeDateInput
      ? parseDateOnly(activeDateInput.value) || parseDateTimeLocal(activeDateInput.value)
      : null;
    buildDayGrid(dpMonth, selected);
  });
  dpTodayBtn?.addEventListener("click", () => {
    pickDate(new Date());
  });
  dpClearBtn?.addEventListener("click", () => {
    if (activeDateInput) activeDateInput.value = "";
    setDatepickerOpen(false);
  });
  dpHourEl?.addEventListener("change", () => {
    if (activeDateInput && activePickerMode === "datetime") {
      const current = parseDateTimeLocal(getInputIsoValue(activeDateInput)) || new Date();
      current.setHours(Number.parseInt(dpHourEl.value, 10) || 0);
      current.setMinutes(Number.parseInt(dpMinuteEl.value, 10) || 0);
      setInputDateValue(activeDateInput, current, "datetime");
    }
  });
  dpMinuteEl?.addEventListener("change", () => {
    if (activeDateInput && activePickerMode === "datetime") {
      const current = parseDateTimeLocal(getInputIsoValue(activeDateInput)) || new Date();
      current.setHours(Number.parseInt(dpHourEl.value, 10) || 0);
      current.setMinutes(Number.parseInt(dpMinuteEl.value, 10) || 0);
      setInputDateValue(activeDateInput, current, "datetime");
    }
  });

  document.addEventListener("click", (e) => {
    if (!datepickerEl.classList.contains("open")) return;
    const target = e.target;
    if (datepickerEl.contains(target)) return;
    if (target && target.dataset && target.dataset.picker) return;
    closeDatepicker();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeDatepicker();
  });

  const inputs = [dateEl, eventStartEl, eventEndEl].filter(Boolean);
  inputs.forEach((input) => {
    input.addEventListener("click", () => openDatepicker(input));
    input.addEventListener("focus", () => openDatepicker(input));
  });
}

function shiftDate(direction) {
  const current = parseDateInput(getInputIsoValue(dateEl));
  const next = new Date(current);

  if (viewMode === "month") {
    next.setMonth(current.getMonth() + direction, 1);
  } else if (viewMode === "week") {
    next.setDate(current.getDate() + 7 * direction);
  } else {
    next.setDate(current.getDate() + direction);
  }

  setDateInput(next);
  loadEvents();
}

function startOfDay(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function dateKey(date) {
  const d = new Date(date);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function isTodayKey(key) {
  return key === todayLocalDateInput();
}

function getEventDateKey(ev) {
  if (ev.start && ev.start.length === 10) return ev.start;
  return dateKey(ev.start);
}

function weekStart(date) {
  const d = startOfDay(date);
  const day = d.getDay();
  const diff = (day + 6) % 7;
  d.setDate(d.getDate() - diff);
  return d;
}

function monthGridStart(date) {
  const first = new Date(date.getFullYear(), date.getMonth(), 1);
  return weekStart(first);
}

function renderCalendars(items) {
  calendarListEl.innerHTML = "";
  if (!items || items.length === 0) {
    calendarStatusEl.textContent = "Aucun calendrier trouve.";
    return;
  }

  calendarStatusEl.textContent = "";
  items.forEach((cal) => {
    const row = document.createElement("label");
    row.className = "calendar-item";

    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.checked = selectedIds.includes(cal.id);
    cb.addEventListener("change", () => {
      if (cb.checked) {
        selectedIds.push(cal.id);
      } else {
        selectedIds = selectedIds.filter((id) => id !== cal.id);
      }
      chrome.storage.local.set({ gcalSelectedCalendars: selectedIds });
      loadEvents();
      loadNextEvents();
    });

    const dot = document.createElement("span");
    dot.className = "calendar-dot";
    dot.style.background = cal.backgroundColor || "#94a3b8";

    const label = document.createElement("span");
    label.textContent = normalizeText(cal.summary || cal.id);

    row.appendChild(cb);
    row.appendChild(dot);
    row.appendChild(label);
    calendarListEl.appendChild(row);
  });
}

function renderNotifyCalendars(items) {
  if (!notifyListEl) return;
  notifyListEl.innerHTML = "";
  items.forEach((cal) => {
    const row = document.createElement("label");
    row.className = "calendar-item";

    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.checked = notifyIds.includes(cal.id);
    cb.addEventListener("change", () => {
      if (cb.checked) {
        notifyIds.push(cal.id);
      } else {
        notifyIds = notifyIds.filter((id) => id !== cal.id);
      }
      chrome.runtime.sendMessage({
        type: "GCAL_SET_NOTIFY_PREFS",
        payload: { ids: notifyIds },
      });
    });

    const dot = document.createElement("span");
    dot.className = "calendar-dot";
    dot.style.background = cal.backgroundColor || "#94a3b8";

    const label = document.createElement("span");
    label.textContent = normalizeText(cal.summary || cal.id);

    row.appendChild(cb);
    row.appendChild(dot);
    row.appendChild(label);
    notifyListEl.appendChild(row);
  });
}

function formatEventTime(ev) {
  const start = ev.start ? new Date(ev.start) : null;
  const end = ev.end ? new Date(ev.end) : null;
  if (!start) return "";
  const opts = { hour: "2-digit", minute: "2-digit" };
  if (ev.start.length === 10) return start.toLocaleDateString();
  const startStr = start.toLocaleTimeString([], opts);
  const endStr = end ? end.toLocaleTimeString([], opts) : "";
  return endStr ? `${startStr} - ${endStr}` : startStr;
}

function detectEventType(ev) {
  const explicit = normalizeText(ev?.eventType || "").toLowerCase();
  if (explicit) return explicit;
  const text = `${ev?.summary || ""} ${ev?.description || ""} ${ev?.location || ""}`.toLowerCase();
  if (/deadline|due|date limite/.test(text)) return "deadline";
  if (/entretien|interview/.test(text)) return "entretien";
  if (ev?.meetingLink) return "meeting";
  return "default";
}

function getEventAccentColor(ev) {
  if (!ev) return "#2563eb";
  const sourceType = normalizeText(ev.sourceType || (ev.readOnly ? "ical" : "google")).toLowerCase();
  const type = detectEventType(ev);
  if (sourceType === "ical") return "#14b8a6";
  if (type === "deadline") return "#f59e0b";
  if (type === "entretien") return "#ef4444";
  if (type === "meeting") return "#0ea5e9";
  return getCalendarColor(ev.calendarId);
}

function formatTooltipDateTime(value) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value || "");
  return d.toLocaleString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function buildEventHoverText(ev) {
  const lines = [];
  const title = normalizeText(ev?.summary || "Evenement");
  lines.push(title);

  if (ev?.calendarSummary) {
    lines.push(`Calendrier: ${normalizeText(ev.calendarSummary)}`);
  }

  if (isAllDayEvent(ev)) {
    const day = String(ev?.start || "");
    lines.push(`Quand: ${day || "Toute la journée"}`);
  } else {
    const start = formatTooltipDateTime(ev?.start);
    const end = formatTooltipDateTime(ev?.end);
    if (start && end) lines.push(`Quand: ${start} -> ${end}`);
    else if (start) lines.push(`Quand: ${start}`);
  }

  const location = normalizeText(ev?.location || "");
  if (location) lines.push(`Lieu: ${location}`);

  const description = normalizeText(String(ev?.description || "").replace(/\s+/g, " "));
  if (description) {
    const short = description.length > 300 ? `${description.slice(0, 297)}...` : description;
    lines.push(`Description: ${short}`);
  }

  const attendees = Array.isArray(ev?.attendees) ? ev.attendees.filter(Boolean) : [];
  if (attendees.length) {
    lines.push(`Invites: ${attendees.slice(0, 8).join(", ")}${attendees.length > 8 ? "..." : ""}`);
  }

  const link = normalizeText(ev?.sourceUrl || "");
  if (link) lines.push(`Lien: ${link}`);

  const meetingLink = normalizeText(ev?.meetingLink || "");
  if (meetingLink && meetingLink !== link) lines.push(`Visio: ${meetingLink}`);

  if (ev?.readOnly) lines.push("Lecture seule (iCal)");

  return lines.join("\n");
}

function ensureEventPopover() {
  if (eventPopoverEl) return eventPopoverEl;
  const pop = document.createElement("div");
  pop.className = "event-popover";
  document.body.appendChild(pop);
  pop.addEventListener("mouseenter", () => {
    if (eventPopoverHideTimer) clearTimeout(eventPopoverHideTimer);
  });
  pop.addEventListener("mouseleave", () => {
    eventPopoverHideTimer = setTimeout(() => {
      pop.classList.remove("visible");
    }, 120);
  });
  eventPopoverEl = pop;
  return pop;
}

function closeEventPopoverSoon() {
  const pop = ensureEventPopover();
  if (eventPopoverHideTimer) clearTimeout(eventPopoverHideTimer);
  eventPopoverHideTimer = setTimeout(() => {
    pop.classList.remove("visible");
  }, 120);
}

function attachEventHoverPopover(anchorEl, ev) {
  if (!anchorEl || !ev) return;
  const pop = ensureEventPopover();
  const eventType = detectEventType(ev);
  const sourceType = normalizeText(ev.sourceType || (ev.readOnly ? "ical" : "google")).toLowerCase();
  const eventTypeLabel =
    eventType === "deadline"
      ? "Deadline"
      : eventType === "entretien"
        ? "Entretien"
        : eventType === "meeting"
          ? "Reunion"
          : "Evenement";
  const sourceLabel = sourceType === "ical" ? "Source iCal" : "Source Google";

  const createDetailRow = (label, value) => {
    if (!value) return null;
    const row = document.createElement("div");
    row.className = "event-popover-row";
    const lbl = document.createElement("div");
    lbl.className = "event-popover-label";
    lbl.textContent = label;
    const val = document.createElement("div");
    val.className = "event-popover-value";
    val.textContent = value;
    row.appendChild(lbl);
    row.appendChild(val);
    return row;
  };

  const show = () => {
    if (eventPopoverHideTimer) clearTimeout(eventPopoverHideTimer);

    const root = document.createElement("div");
    const header = document.createElement("div");
    header.className = "event-popover-header";
    const title = document.createElement("div");
    title.className = "event-popover-title";
    title.textContent = normalizeText(ev.summary || "Evenement");
    header.appendChild(title);

    const badges = document.createElement("div");
    badges.className = "event-popover-badges";
    const typeBadge = document.createElement("span");
    typeBadge.className = "event-popover-badge type";
    typeBadge.textContent = eventTypeLabel;
    badges.appendChild(typeBadge);
    const sourceBadge = document.createElement("span");
    sourceBadge.className = "event-popover-badge source";
    sourceBadge.textContent = sourceLabel;
    badges.appendChild(sourceBadge);
    if (ev.readOnly) {
      const readOnlyBadge = document.createElement("span");
      readOnlyBadge.className = "event-popover-badge";
      readOnlyBadge.textContent = "Lecture seule";
      badges.appendChild(readOnlyBadge);
    }
    header.appendChild(badges);
    root.appendChild(header);

    const details = document.createElement("div");
    details.className = "event-popover-details";
    const whenText = isAllDayEvent(ev)
      ? String(ev?.start || "Toute la journee")
      : (() => {
          const start = formatTooltipDateTime(ev?.start);
          const end = formatTooltipDateTime(ev?.end);
          return start && end ? `${start} -> ${end}` : start;
        })();
    const rows = [
      createDetailRow("Calendrier", normalizeText(ev?.calendarSummary || "")),
      createDetailRow("Quand", whenText),
      createDetailRow("Lieu", normalizeText(ev?.location || "")),
      createDetailRow("Description", normalizeText(String(ev?.description || "").replace(/\s+/g, " "))),
      createDetailRow(
        "Invites",
        Array.isArray(ev?.attendees) ? ev.attendees.filter(Boolean).join(", ") : ""
      ),
      createDetailRow("Lien", normalizeText(ev?.sourceUrl || ev?.htmlLink || "")),
      createDetailRow("Visio", normalizeText(ev?.meetingLink || "")),
    ].filter(Boolean);
    rows.forEach((row) => details.appendChild(row));
    root.appendChild(details);

    const actions = document.createElement("div");
    actions.className = "event-popover-actions";

    const makeBtn = (label, onClick, primary = false) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.textContent = label;
      btn.className = `event-popover-btn${primary ? " primary" : ""}`;
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        onClick();
      });
      return btn;
    };

    const openUrl = ev.meetingLink || ev.sourceUrl || ev.htmlLink || "";
    if (openUrl) {
      actions.appendChild(
        makeBtn("Ouvrir lien", () => window.open(openUrl, "_blank", "noreferrer"), true)
      );
    }

    actions.appendChild(
      makeBtn("Copier infos", () => {
        const text = buildEventHoverText(ev);
        if (navigator?.clipboard?.writeText) {
          navigator.clipboard.writeText(text).then(
            () => setEventFormStatus("Infos copiees.", "ok"),
            () => setEventFormStatus("Copie impossible.", "error")
          );
        } else {
          setEventFormStatus("Clipboard non disponible.", "error");
        }
      })
    );

    root.appendChild(actions);

    pop.innerHTML = "";
    pop.appendChild(root);
    const rect = anchorEl.getBoundingClientRect();
    const popWidth = Math.min(420, window.innerWidth - 16);
    const preferRight = rect.right + 10 + popWidth <= window.innerWidth - 8;
    const left = preferRight ? rect.right + 10 : Math.max(8, rect.left - popWidth - 10);
    const top = Math.min(window.innerHeight - 220, Math.max(8, rect.top - 4));
    pop.style.left = `${left}px`;
    pop.style.top = `${top}px`;
    pop.classList.add("visible");
  };

  anchorEl.addEventListener("mouseenter", show);
  anchorEl.addEventListener("focus", show);
  anchorEl.addEventListener("mouseleave", closeEventPopoverSoon);
  anchorEl.addEventListener("blur", closeEventPopoverSoon);
}

function isAllDayEvent(ev) {
  const start = String(ev.start || "");
  const end = String(ev.end || "");
  return start.length === 10 || end.length === 10;
}

function eventDateForKey(ev) {
  if (typeof ev.start === "string" && ev.start.length === 10) {
    return ev.start;
  }
  return dateKey(ev.start);
}

function toEventDateTime(value, fallback) {
  const dt = value ? new Date(value) : null;
  if (dt && !Number.isNaN(dt.getTime())) return dt;
  return fallback;
}

function minutesSinceStartOfDay(date) {
  return date.getHours() * 60 + date.getMinutes();
}

function buildTimeAxis() {
  const axis = document.createElement("div");
  axis.className = "time-axis";
  for (let h = 0; h < 24; h += 1) {
    const label = document.createElement("div");
    label.className = "time-label";
    label.textContent = `${String(h).padStart(2, "0")}:00`;
    axis.appendChild(label);
  }
  return axis;
}

function attachDragToEvent(block, ev, dayDate, gridEl) {
  if (!block || !ev || !gridEl) return;
  if (isAllDayEvent(ev)) return;
  if (ev.readOnly) return;
  if (!ev.calendarId || !ev.id) return;

  let pointerActive = false;
  let startPoint = null;

  const onPointerMove = (e) => {
    if (!pointerActive || !startPoint) return;
    e.preventDefault();
  };

  const onPointerUp = (e) => {
    if (!pointerActive || !startPoint) return;
    pointerActive = false;
    block.releasePointerCapture?.(e.pointerId);
    document.removeEventListener("pointermove", onPointerMove);
    document.removeEventListener("pointerup", onPointerUp);

    const gridRect = gridEl.getBoundingClientRect();
    const x = e.clientX - gridRect.left;
    const y = e.clientY - gridRect.top;
    if (x < 0 || y < 0) return;

    const dayBase = new Date(dayDate);
    let targetDate = new Date(dayBase);
    if (viewMode === "week") {
      const colWidth = gridRect.width / 7;
      const dayIndex = Math.min(6, Math.max(0, Math.floor(x / colWidth)));
      targetDate.setDate(dayBase.getDate() + dayIndex);
    }

    const minutes = Math.min(1439, Math.max(0, Math.round((y / gridRect.height) * 1440 / 5) * 5));
    targetDate.setHours(0, 0, 0, 0);
    targetDate.setMinutes(minutes);

    const startDt = ev.start ? new Date(ev.start) : null;
    const endDt = ev.end ? new Date(ev.end) : null;
    let durationMs = 30 * 60 * 1000;
    if (startDt && endDt && !Number.isNaN(startDt.getTime()) && !Number.isNaN(endDt.getTime())) {
      durationMs = Math.max(15 * 60 * 1000, endDt.getTime() - startDt.getTime());
    }

    const newStart = new Date(targetDate);
    const newEnd = new Date(newStart.getTime() + durationMs);
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
    const patch = {
      start: { dateTime: newStart.toISOString(), timeZone },
      end: { dateTime: newEnd.toISOString(), timeZone },
    };

    chrome.runtime.sendMessage(
      {
        type: "GCAL_UPDATE_EVENT",
        payload: { calendarId: ev.calendarId, eventId: ev.id, patch, sendUpdates: "none" },
      },
      (res) => {
        if (chrome.runtime.lastError || !res?.ok) {
          setEventFormStatus(`Erreur: ${res?.error || "inconnue"}`, "error");
          return;
        }
        setEventFormStatus("Événement déplacé.", "ok");
        loadEvents();
        loadNextEvents();
      }
    );
  };

  block.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return;
    pointerActive = true;
    startPoint = { x: e.clientX, y: e.clientY };
    block.setPointerCapture?.(e.pointerId);
    document.addEventListener("pointermove", onPointerMove);
    document.addEventListener("pointerup", onPointerUp);
  });
}

function getCalendarColor(calendarId) {
  if (calendarId === EXTERNAL_ICAL_CAL_ID) return EXTERNAL_ICAL_CAL_COLOR;
  const cal = calendars.find((c) => c.id === calendarId);
  return cal?.backgroundColor || "#2563eb";
}

function getMeetingType(link) {
  const url = String(link || "");
  if (/meet\.google\.com/i.test(url)) return "meet";
  if (/zoom\.us\/j\//i.test(url)) return "zoom";
  if (/teams\.microsoft\.com\/l\/meetup-join/i.test(url)) return "teams";
  return "other";
}

function setCalendarFilterOptions(items) {
  if (!calendarFilterEl) return;
  const previous = calendarFilterId;
  calendarFilterEl.innerHTML = "";

  const allOpt = document.createElement("option");
  allOpt.value = "all";
  allOpt.textContent = "Tous les calendriers";
  calendarFilterEl.appendChild(allOpt);

  (items || []).forEach((cal) => {
    const opt = document.createElement("option");
    opt.value = cal.id;
    opt.textContent = cal.summary || cal.id;
    calendarFilterEl.appendChild(opt);
  });

  const exists = previous === "all" || (items || []).some((c) => c.id === previous);
  calendarFilterId = exists ? previous : "all";
  calendarFilterEl.value = calendarFilterId;
}

function sortEvents(list) {
  const items = Array.isArray(list) ? [...list] : [];
  const byStartAsc = (a, b) => new Date(a.start) - new Date(b.start);
  const byTitleAsc = (a, b) => (a.summary || "").localeCompare(b.summary || "", "fr");

  switch (sortMode) {
    case "start-desc":
      return items.sort((a, b) => byStartAsc(b, a));
    case "title-asc":
      return items.sort(byTitleAsc);
    case "title-desc":
      return items.sort((a, b) => byTitleAsc(b, a));
    case "start-asc":
    default:
      return items.sort(byStartAsc);
  }
}

function downloadJson(filename, data) {
  try {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  } catch (err) {
    setEventFormStatus(err?.message || "Export impossible.", "error");
  }
}

function exportEvents() {
  const filtered = sortEvents((lastEvents || []).filter(passesFilters));
  const payload = {
    exportedAt: new Date().toISOString(),
    viewMode,
    date: getInputIsoValue(dateEl) || "",
    filters: {
      calendarFilterId,
      meetingFilter,
      search: normalizeText(searchEl?.value || ""),
      sortMode,
    },
    count: filtered.length,
    events: filtered,
  };
  const datePart = payload.date || "now";
  downloadJson(`events-${datePart}.json`, payload);
}

function exportDiagnostics() {
  chrome.runtime.sendMessage({ type: "DIAG_GET_STATUS" }, (res) => {
    if (chrome.runtime.lastError) {
      setEventFormStatus(`Erreur: ${chrome.runtime.lastError.message}`, "error");
      return;
    }
    if (!res?.ok) {
      setEventFormStatus(`Erreur: ${res?.error || "diagnostic"}`, "error");
      return;
    }
    const payload = {
      exportedAt: new Date().toISOString(),
      diagnostics: res,
    };
    downloadJson("diagnostics.json", payload);
  });
}

function passesFilters(ev) {
  if (calendarFilterId !== "all" && ev.calendarId !== calendarFilterId) {
    return false;
  }
  const q = normalizeText(searchEl?.value || "").toLowerCase();
  if (q) {
    const hay = `${ev.summary || ""} ${ev.location || ""} ${ev.calendarSummary || ""} ${
      ev.sourceUrl || ""
    }`.toLowerCase();
    if (!hay.includes(q)) return false;
  }
  if (meetingFilter === "all") return true;
  return getMeetingType(ev.meetingLink) === meetingFilter;
}

function makeEventChip(ev) {
  const chip = document.createElement("div");
  chip.className = "event-chip";
  chip.style.borderLeftColor = getEventAccentColor(ev);
  chip.tabIndex = 0;
  chip.title = buildEventHoverText(ev);
  attachEventHoverPopover(chip, ev);

  const title = document.createElement("div");
  title.className = "event-title";
  title.textContent = normalizeText(ev.summary || "Evenement");

  const meta = document.createElement("div");
  meta.className = "event-meta";
  const timeStr = formatEventTime(ev);
  meta.textContent = timeStr || "";

  chip.appendChild(title);
  if (meta.textContent) chip.appendChild(meta);

  const locationText = normalizeText(ev.location || "");
  if (locationText) {
    const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
      locationText
    )}`;
    const loc = document.createElement("a");
    loc.className = "event-meta event-location-link";
    loc.href = mapsUrl;
    loc.target = "_blank";
    loc.rel = "noreferrer";
    loc.textContent = `?? ${locationText}`;
    loc.addEventListener("click", (e) => e.stopPropagation());
    chip.appendChild(loc);
  }

  if (ev.sourceUrl) {
    const link = document.createElement("a");
    link.className = "event-join";
    link.href = ev.sourceUrl;
    link.target = "_blank";
    link.rel = "noreferrer";
    link.textContent = formatLinkLabel(ev.sourceUrl) || "Lien";
    link.addEventListener("click", (e) => e.stopPropagation());
    chip.appendChild(link);
  }

  if (Array.isArray(ev.tags) && ev.tags.length) {
    const tags = document.createElement("div");
    tags.className = "event-meta";
    tags.textContent = ev.tags.join(" · ");
    chip.appendChild(tags);
  }

  if (ev.meetingLink) {
    const join = document.createElement("a");
    join.className = "event-join";
    join.href = ev.meetingLink;
    join.target = "_blank";
    join.rel = "noreferrer";
    join.textContent = "Rejoindre";
    chip.appendChild(join);
  }

  if (ev.readOnly) {
    const readOnlyMeta = document.createElement("div");
    readOnlyMeta.className = "event-meta";
    readOnlyMeta.textContent = "Lecture seule (iCal)";
    chip.appendChild(readOnlyMeta);
  } else {
    const actions = document.createElement("div");
    actions.className = "event-actions";

    const editBtn = document.createElement("button");
    editBtn.type = "button";
    editBtn.className = "event-action";
    editBtn.textContent = "Modifier";
    editBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      startEditingEvent(ev);
    });
    actions.appendChild(editBtn);

    const delBtn = document.createElement("button");
    delBtn.type = "button";
    delBtn.className = "event-action danger";
    delBtn.textContent = "Supprimer";
    delBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      const ok = window.confirm("Supprimer cet événement ?");
      if (!ok) return;
      const hasAttendees = Array.isArray(ev.attendees) && ev.attendees.length > 0;
      chrome.runtime.sendMessage(
        {
          type: "GCAL_DELETE_EVENT",
          payload: {
            calendarId: ev.calendarId,
            eventId: ev.id,
            sendUpdates: hasAttendees ? "all" : "none",
          },
        },
        (res) => {
          if (chrome.runtime.lastError) {
            setEventFormStatus(`Erreur: ${chrome.runtime.lastError.message}`, "error");
            return;
          }
          if (!res?.ok) {
            setEventFormStatus(`Erreur: ${res?.error || "inconnue"}`, "error");
            return;
          }
          if (editingEvent?.id === ev.id) {
            editingEvent = null;
          }
          setEventFormStatus("Événement supprimé.", "ok");
          loadEvents();
          loadNextEvents();
        }
      );
    });
    actions.appendChild(delBtn);
    chip.appendChild(actions);
  }

  const openUrl = ev.meetingLink || ev.htmlLink || "";
  if (openUrl) {
    chip.addEventListener("click", () => {
      window.open(openUrl, "_blank", "noreferrer");
    });
    chip.addEventListener("keydown", (e) => {
      if (e.key === "Enter") window.open(openUrl, "_blank", "noreferrer");
    });
  }

  return chip;
}

function renderEvents(items) {
  eventsEl.innerHTML = "";
  const filtered = sortEvents((items || []).filter(passesFilters));
  if (!items || items.length === 0) {
    eventsStatusEl.textContent = "Aucun evenement dans cette periode.";
  } else if (filtered.length === 0) {
    eventsStatusEl.textContent = "Aucun evenement avec ces filtres.";
  } else {
    eventsStatusEl.textContent = "";
  }

  const groups = new Map();
  filtered.forEach((ev) => {
    const key = eventDateForKey(ev);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(ev);
  });

  const baseDate = parseDateInput(getInputIsoValue(dateEl));
  if (viewMode === "agenda") {
    const list = document.createElement("div");
    list.className = "agenda-list";
    let lastDateKey = "";
    filtered.forEach((ev) => {
      const key = eventDateForKey(ev);
      if (key !== lastDateKey) {
        lastDateKey = key;
        const dateLabel = document.createElement("div");
        dateLabel.className = "agenda-date";
        const dateObj = new Date(key);
        dateLabel.textContent = dateObj.toLocaleDateString(undefined, {
          weekday: "long",
          day: "numeric",
          month: "short",
        });
        list.appendChild(dateLabel);
      }

      const row = document.createElement("div");
      row.className = "agenda-item";
      row.tabIndex = 0;
      row.title = buildEventHoverText(ev);
      attachEventHoverPopover(row, ev);

      const dot = document.createElement("span");
      dot.className = "agenda-dot";
      dot.style.background = getEventAccentColor(ev);
      row.appendChild(dot);

      const content = document.createElement("div");
      const title = document.createElement("div");
      title.className = "agenda-title";
      title.textContent = normalizeText(ev.summary || "Evenement");
      const meta = document.createElement("div");
      meta.className = "agenda-meta";
      meta.textContent = isAllDayEvent(ev) ? "Toute la journée" : formatEventTime(ev);
      content.appendChild(title);
      content.appendChild(meta);
      row.appendChild(content);

      const openUrl = ev.meetingLink || ev.htmlLink || "";
      if (openUrl) {
        row.addEventListener("click", () => window.open(openUrl, "_blank", "noreferrer"));
        row.addEventListener("keydown", (e) => {
          if (e.key === "Enter") window.open(openUrl, "_blank", "noreferrer");
        });
      }

      list.appendChild(row);
    });
    eventsEl.appendChild(list);
    return;
  }

  if (viewMode === "day") {
    const key = dateKey(baseDate);
    const dayEvents = groups.get(key) || [];
    const allDay = dayEvents.filter(isAllDayEvent);
    const timed = dayEvents.filter((ev) => !isAllDayEvent(ev));

    const allDayRow = document.createElement("div");
    allDayRow.className = "all-day-row";
    const allDayLabel = document.createElement("div");
    allDayLabel.className = "all-day-label";
    allDayLabel.textContent = "Toute la journée";
    const allDayList = document.createElement("div");
    allDayList.className = "all-day-list";
    allDay.forEach((ev) => {
      const chip = makeEventChip(ev);
      chip.classList.add("all-day-chip");
      allDayList.appendChild(chip);
    });
    allDayRow.appendChild(allDayLabel);
    allDayRow.appendChild(allDayList);
    eventsEl.appendChild(allDayRow);

    const timeGrid = document.createElement("div");
    timeGrid.className = "time-grid";
    timeGrid.appendChild(buildTimeAxis());

    const dayGrid = document.createElement("div");
    dayGrid.className = "day-grid";
    const daySlots = document.createElement("div");
    daySlots.className = "day-slots";
    for (let i = 0; i < 24; i += 1) {
      const slot = document.createElement("div");
      slot.className = "day-slot";
      daySlots.appendChild(slot);
    }
    const dayEventsLayer = document.createElement("div");
    dayEventsLayer.className = "day-events-layer";

    timed.forEach((ev) => {
      const start = toEventDateTime(ev.start, new Date(baseDate));
      const endFallback = new Date(start);
      endFallback.setMinutes(endFallback.getMinutes() + 30);
      const end = toEventDateTime(ev.end, endFallback);
      const startMin = minutesSinceStartOfDay(start);
      const endMin = Math.max(startMin + 15, minutesSinceStartOfDay(end));
      const block = makeEventChip(ev);
      block.classList.add("event-block");
      block.style.top = `calc(var(--hour-height) * ${startMin / 60})`;
      block.style.height = `calc(var(--hour-height) * ${Math.max(15, endMin - startMin) / 60})`;
      block.style.borderLeftColor = getEventAccentColor(ev);
      attachDragToEvent(block, ev, baseDate, dayGrid);
      dayEventsLayer.appendChild(block);
    });

    dayGrid.appendChild(daySlots);
    dayGrid.appendChild(dayEventsLayer);
    timeGrid.appendChild(dayGrid);
    eventsEl.appendChild(timeGrid);
    return;
  }

  if (viewMode === "week") {
    const start = weekStart(baseDate);
    const header = document.createElement("div");
    header.className = "week-header";
    const headerSpacer = document.createElement("div");
    headerSpacer.className = "time-spacer";
    header.appendChild(headerSpacer);
    for (let i = 0; i < 7; i += 1) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      const label = document.createElement("div");
      label.className = "day-header";
      label.textContent = d.toLocaleDateString(undefined, { weekday: "short", day: "numeric" });
      if (isTodayKey(dateKey(d))) label.classList.add("today");
      header.appendChild(label);
    }
    eventsEl.appendChild(header);

    const allDayRow = document.createElement("div");
    allDayRow.className = "week-all-day";
    const allDayLabel = document.createElement("div");
    allDayLabel.className = "all-day-label";
    allDayLabel.textContent = "Toute la journée";
    allDayRow.appendChild(allDayLabel);

    for (let i = 0; i < 7; i += 1) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      const key = dateKey(d);
      const cell = document.createElement("div");
      cell.className = "all-day-list";
      const dayEvents = (groups.get(key) || []).filter(isAllDayEvent);
      dayEvents.forEach((ev) => {
        const chip = makeEventChip(ev);
        chip.classList.add("all-day-chip");
        cell.appendChild(chip);
      });
      allDayRow.appendChild(cell);
    }
    eventsEl.appendChild(allDayRow);

    const timeGrid = document.createElement("div");
    timeGrid.className = "week-time-grid";
    timeGrid.appendChild(buildTimeAxis());

    const weekDays = document.createElement("div");
    weekDays.className = "week-days";

    for (let i = 0; i < 7; i += 1) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      const key = dateKey(d);
      const col = document.createElement("div");
      col.className = "day-grid";
      if (isTodayKey(key)) col.classList.add("today");

      const slots = document.createElement("div");
      slots.className = "day-slots";
      for (let h = 0; h < 24; h += 1) {
        const slot = document.createElement("div");
        slot.className = "day-slot";
        slots.appendChild(slot);
      }

      const layer = document.createElement("div");
      layer.className = "day-events-layer";
      const timed = (groups.get(key) || []).filter((ev) => !isAllDayEvent(ev));
      timed.forEach((ev) => {
        const startDt = toEventDateTime(ev.start, new Date(d));
        const endFallback = new Date(startDt);
        endFallback.setMinutes(endFallback.getMinutes() + 30);
        const endDt = toEventDateTime(ev.end, endFallback);
        const startMin = minutesSinceStartOfDay(startDt);
        const endMin = Math.max(startMin + 15, minutesSinceStartOfDay(endDt));
        const block = makeEventChip(ev);
        block.classList.add("event-block");
        block.style.top = `calc(var(--hour-height) * ${startMin / 60})`;
        block.style.height = `calc(var(--hour-height) * ${Math.max(15, endMin - startMin) / 60})`;
        block.style.borderLeftColor = getEventAccentColor(ev);
        attachDragToEvent(block, ev, start, weekDays);
        layer.appendChild(block);
      });

      col.appendChild(slots);
      col.appendChild(layer);
      weekDays.appendChild(col);
    }

    timeGrid.appendChild(weekDays);
    eventsEl.appendChild(timeGrid);
    return;
  }

  const start = monthGridStart(baseDate);
  const month = baseDate.getMonth();
  const dates = [];
  for (let i = 0; i < 42; i += 1) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    dates.push(d);
  }

  const header = document.createElement("div");
  header.className = "calendar-month";
  for (let i = 0; i < 7; i += 1) {
    const label = document.createElement("div");
    label.className = "day-header";
    label.textContent = new Date(2024, 0, i + 1).toLocaleDateString(undefined, { weekday: "short" });
    header.appendChild(label);
  }
  eventsEl.appendChild(header);

  const grid = document.createElement("div");
  grid.className = "calendar-month";
  dates.forEach((d) => {
    const cell = document.createElement("div");
    cell.className = "day-cell";
    const number = document.createElement("div");
    number.className = "day-number";
    number.textContent = d.getDate();
    const key = dateKey(d);
    if (isTodayKey(key)) {
      cell.classList.add("today");
      number.classList.add("today");
    }
    if (d.getMonth() !== month) number.style.opacity = "0.4";
    cell.appendChild(number);
    const dayEvents = groups.get(key) || [];
    const list = document.createElement("div");
    list.className = "day-events-list";
    dayEvents.forEach((ev) => {
      const item = document.createElement("div");
      item.className = "month-event";
      item.textContent = normalizeText(ev.summary || "Evenement");
      item.title = buildEventHoverText(ev);
      item.tabIndex = 0;
      attachEventHoverPopover(item, ev);
      list.appendChild(item);
    });
    cell.appendChild(list);
    grid.appendChild(cell);
  });
  eventsEl.appendChild(grid);
}

function renderNextEvents(items) {
  nextEventsEl.innerHTML = "";
  if (!items || items.length === 0) {
    nextStatusEl.textContent = "Aucun evenement a venir.";
    return;
  }
  nextStatusEl.textContent = "";
  items.forEach((ev) => nextEventsEl.appendChild(makeEventChip(ev)));
}

function loadNextEvents() {
  const now = new Date();
  const timeMin = now.toISOString();
  const timeMax = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString();
  nextStatusEl.textContent = "Chargement...";
  (async () => {
    const combined = await loadCombinedEvents(timeMin, timeMax, selectedIds);
    const hasGoogleEvents = (combined.google.events || []).length > 0;
    const hasExternalEvents = (combined.external.events || []).length > 0;
    const filtered = sortEvents((combined.events || []).filter(passesFilters));
    renderNextEvents(filtered.slice(0, 3));

    if (!combined.google.ok && !hasGoogleEvents && !combined.external.hasSource) {
      nextStatusEl.textContent =
        combined.google.authRequired === true
          ? "Non connecte. Connecte Google dans Options."
          : `Erreur: ${combined.google.error || "inconnue"}`;
      return;
    }
    if (!combined.external.ok && !hasExternalEvents && !hasGoogleEvents) {
      nextStatusEl.textContent = `Erreur: ${combined.external.error || "iCal indisponible"}`;
      return;
    }
    if (!combined.google.ok && hasExternalEvents) {
      nextStatusEl.textContent = "Google indisponible. Flux iCal affiché.";
      return;
    }
    if (!combined.external.ok && hasGoogleEvents) {
      nextStatusEl.textContent = "Flux iCal indisponible. Google affiché.";
    }
  })();
}

function loadCalendars() {
  calendarStatusEl.textContent = "Chargement...";
  chrome.runtime.sendMessage({ type: "GCAL_AUTH_STATUS" }, (auth) => {
    if (!auth?.connected) {
      calendars = [];
      selectedIds = [];
      renderCalendars(calendars);
      notifyIds = [];
      renderNotifyCalendars(calendars);
      setCalendarFilterOptionsWithExternal(calendars);
      chrome.storage.local.get([EXTERNAL_ICAL_URL_KEY], (data) => {
        const sourceUrl = normalizeUrl(data?.[EXTERNAL_ICAL_URL_KEY] || "");
        calendarStatusEl.textContent = sourceUrl
          ? "Google non connecte. Flux iCal externe actif."
          : "Non connecte. Connecte Google dans Options.";
      });
      loadEvents();
      loadNextEvents();
      return;
    }
    chrome.runtime.sendMessage({ type: "GCAL_LIST_CALENDARS" }, (res) => {
      if (chrome.runtime.lastError) {
        calendarStatusEl.textContent = `Erreur: ${chrome.runtime.lastError.message}`;
        return;
      }
      if (!res?.ok) {
        calendarStatusEl.textContent = `Erreur: ${res?.error || "inconnue"}`;
        return;
      }
      calendars = res.items || [];
      setCalendarFilterOptionsWithExternal(calendars);
      chrome.storage.local.get(["gcalSelectedCalendars"], (data) => {
        const stored = Array.isArray(data.gcalSelectedCalendars) ? data.gcalSelectedCalendars : [];
        selectedIds = stored.length ? stored : calendars.map((c) => c.id);
        renderCalendars(calendars);
        chrome.runtime.sendMessage({ type: "GCAL_GET_NOTIFY_PREFS" }, (prefs) => {
          notifyIds = Array.isArray(prefs?.ids) && prefs.ids.length
            ? prefs.ids
            : calendars.map((c) => c.id);
          renderNotifyCalendars(calendars);
        });
        loadEvents();
        loadNextEvents();
      });
    });
  });
}

let eventsDebounceId = null;
function loadEvents() {
  if (eventsDebounceId) clearTimeout(eventsDebounceId);
  eventsDebounceId = setTimeout(() => {
    const date = parseDateInput(getInputIsoValue(dateEl));
    const { timeMin, timeMax } = rangeForView(date, viewMode);
    const now = new Date();
    const min = new Date(timeMin);
    const effectiveMin = min < now ? now : min;
    eventsStatusEl.textContent = "Chargement...";
    (async () => {
      const combined = await loadCombinedEvents(effectiveMin.toISOString(), timeMax, selectedIds);
      const hasGoogleEvents = (combined.google.events || []).length > 0;
      const hasExternalEvents = (combined.external.events || []).length > 0;

      if (!combined.google.ok && !combined.external.hasSource && !hasGoogleEvents) {
        const err = combined.google.error || "inconnue";
        eventsStatusEl.textContent =
          combined.google.authRequired === true
            ? "Non connecte. Connecte Google dans Options."
            : `Erreur: ${err}`;
        lastEvents = [];
        return;
      }
      if (!combined.external.ok && !hasExternalEvents && !hasGoogleEvents) {
        eventsStatusEl.textContent = `Erreur: ${combined.external.error || "iCal indisponible"}`;
        lastEvents = [];
        return;
      }

      if (!combined.google.ok && hasExternalEvents) {
        eventsStatusEl.textContent = "Google indisponible. Flux iCal affiché.";
      } else if (!combined.external.ok && hasGoogleEvents) {
        eventsStatusEl.textContent = "Flux iCal indisponible. Google affiché.";
      } else {
        eventsStatusEl.textContent = "";
      }

      lastEvents = combined.events || [];
      updateLastRefresh(Date.now());
      renderEvents(lastEvents);
    })();
  }, 150);
}

function manualRefresh() {
  eventsStatusEl.textContent = "Rafraîchissement...";
  chrome.runtime.sendMessage({ type: "GCAL_CLEAR_EVENT_CACHE" }, () => {
    // Même si le clear échoue, on tente un rechargement.
    lastEvents = [];
    loadEvents();
    loadNextEvents();
  });
}

tabs.forEach((tab) => {
  tab.addEventListener("click", () => {
    tabs.forEach((t) => t.classList.remove("active"));
    tab.classList.add("active");
    tabs.forEach((t) => t.setAttribute("aria-selected", "false"));
    tab.setAttribute("aria-selected", "true");
    viewMode = tab.dataset.view;
    loadEvents();
  });
});

if (sortSelectEl) {
  sortSelectEl.value = sortMode;
  sortSelectEl.addEventListener("change", () => {
    sortMode = sortSelectEl.value || "start-asc";
    renderEvents(lastEvents);
    loadNextEvents();
  });
}

if (calendarFilterEl) {
  calendarFilterEl.value = calendarFilterId;
  calendarFilterEl.addEventListener("change", () => {
    calendarFilterId = calendarFilterEl.value || "all";
    renderEvents(lastEvents);
    loadNextEvents();
  });
}

chrome.storage.local.get([CAL_LAST_REFRESH_KEY], (data) => {
  setRefreshStatus(data[CAL_LAST_REFRESH_KEY]);
});

if (exportEventsBtn) {
  exportEventsBtn.addEventListener("click", exportEvents);
}

if (exportDiagnosticsBtn) {
  exportDiagnosticsBtn.addEventListener("click", exportDiagnostics);
}

refreshBtn.addEventListener("click", manualRefresh);
prevBtn.addEventListener("click", () => shiftDate(-1));
nextBtn.addEventListener("click", () => shiftDate(1));
todayBtn.addEventListener("click", () => {
  const now = new Date();
  setDateInput(now);
  loadEvents();
});

if (createEventBtn) {
  createEventBtn.addEventListener("click", () => {
    const willOpen = !isEventFormOpen;
    toggleEventForm(willOpen);
    if (willOpen) {
      editingEvent = null;
      clearAttendeesField();
      hideLocationSuggestions();
      selectedLocationInfo = null;
      setLocationLoading(false);
      setLocationStatus("", null);
      setLocationValidityClass(null);
      prefillEventForm();
      if (eventSummaryEl) eventSummaryEl.focus();
      setEventFormStatus("", null);
    }
  });
}

if (eventCancelBtn) {
  eventCancelBtn.addEventListener("click", () => {
    toggleEventForm(false);
    setEventFormStatus("", null);
    setAttendeesStatus("", null);
    clearAttendeesField();
    hideLocationSuggestions();
    selectedLocationInfo = null;
    setLocationLoading(false);
    setLocationStatus("", null);
    setLocationValidityClass(null);
    editingEvent = null;
  });
}

if (eventSubmitBtn) {
  eventSubmitBtn.addEventListener("click", submitCreateEvent);
}

  if (eventStartEl) {
  eventStartEl.addEventListener("change", () => {
    if (eventAllDayEl?.checked) {
      const start = parseDateOnly(getInputIsoValue(eventStartEl));
      if (start && eventEndEl) {
        const end = parseDateOnly(getInputIsoValue(eventEndEl)) || new Date(start);
        if (end < start) {
          const nextDay = new Date(start);
          nextDay.setDate(nextDay.getDate() + 1);
          setInputDateValue(eventEndEl, nextDay, "date", true);
        }
      }
      return;
    }
    const start = parseDateTimeLocal(getInputIsoValue(eventStartEl));
    const end = parseDateTimeLocal(getInputIsoValue(eventEndEl));
    if (!start || !end) return;
    if (end <= start) {
      applyDurationFromStart(60);
    }
  });
}

if (eventEndEl) {
  eventEndEl.addEventListener("change", () => {
    if (!eventAllDayEl?.checked) return;
    const start = parseDateOnly(getInputIsoValue(eventStartEl));
    const end = parseDateOnly(getInputIsoValue(eventEndEl));
    if (start && end && end < start) {
      setInputDateValue(eventEndEl, start, "date", true);
    }
  });
}

if (eventAllDayEl) {
  eventAllDayEl.addEventListener("change", () => {
    applyAllDayMode(eventAllDayEl.checked);
  });
}


durationBtns.forEach((btn) => {
  btn.addEventListener("click", () => {
    const minutes = Number.parseInt(btn.dataset.duration || "0", 10);
    if (!Number.isFinite(minutes) || minutes <= 0) return;
    applyDurationFromStart(minutes);
    setEventFormStatus("", null);
  });
});

if (eventAttendeesEl) {
  eventAttendeesEl.addEventListener("input", () => {
    verifyAttendeesField();
  });
  eventAttendeesEl.addEventListener("blur", () => {
    verifyAttendeesField();
  });
  eventAttendeesEl.addEventListener("keydown", (e) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    addAttendeeFromInput();
  });
}

if (eventLocationEl) {
  eventLocationEl.addEventListener("input", () => {
    selectedLocationInfo = null;
    setLocationValidityClass(null);
    setLocationStatus("", null);
    setLocationLoading(false);
    debounceLocationSuggestions(normalizeText(eventLocationEl.value));
  });
  eventLocationEl.addEventListener("blur", () => {
    // Delay to allow suggestion click via mousedown.
    setTimeout(() => {
      hideLocationSuggestions();
      geocodeLocationOnBlur();
    }, 120);
  });
}

if (searchEl) {
  searchEl.addEventListener("input", () => {
    loadEvents();
    loadNextEvents();
  });
}

filterBtns.forEach((btn) => {
  btn.addEventListener("click", () => {
    filterBtns.forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    filterBtns.forEach((b) => b.setAttribute("aria-pressed", "false"));
    btn.setAttribute("aria-pressed", "true");
    meetingFilter = btn.dataset.filter || "all";
    loadEvents();
    loadNextEvents();
  });
});

document.addEventListener("scroll", closeEventPopoverSoon, true);
window.addEventListener("resize", closeEventPopoverSoon);

setInputDateValue(dateEl, new Date(), "date");
loadCalendars();




