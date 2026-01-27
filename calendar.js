const calendarListEl = document.getElementById("calendar-list");
const notifyListEl = document.getElementById("notify-list");
const calendarStatusEl = document.getElementById("calendar-status");
const eventsEl = document.getElementById("calendar-view");
const eventsStatusEl = document.getElementById("events-status");
const nextEventsEl = document.getElementById("next-events");
const nextStatusEl = document.getElementById("next-status");
const dateEl = document.getElementById("date");
const searchEl = document.getElementById("search");
const refreshBtn = document.getElementById("refresh");
const prevBtn = document.getElementById("prev");
const nextBtn = document.getElementById("next");
const todayBtn = document.getElementById("today");
const createEventBtn = document.getElementById("create-event-btn");
const eventFormCard = document.getElementById("event-form-card");
const eventSummaryEl = document.getElementById("event-summary");
const eventLocationEl = document.getElementById("event-location");
const eventLocationSuggestionsEl = document.getElementById("event-location-suggestions");
const eventLocationStatusEl = document.getElementById("event-location-status");
const eventDescriptionEl = document.getElementById("event-description");
const eventAttendeesEl = document.getElementById("event-attendees");
const eventAttendeesStatusEl = document.getElementById("event-attendees-status");
const eventAttendeesChipsEl = document.getElementById("event-attendees-chips");
const eventStartEl = document.getElementById("event-start");
const eventEndEl = document.getElementById("event-end");
const eventUseMeetEl = document.getElementById("event-use-meet");
const eventSendInvitesEl = document.getElementById("event-send-invites");
const eventSubmitBtn = document.getElementById("event-submit");
const eventCancelBtn = document.getElementById("event-cancel");
const eventFormStatusEl = document.getElementById("event-form-status");
const durationBtns = Array.from(
  document.querySelectorAll("#event-form-card .duration-row [data-duration]")
);
const tabs = Array.from(document.querySelectorAll(".tab"));
const filterBtns = Array.from(document.querySelectorAll(".filter"));

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
  setLocationValidityClass("ok");
  setLocationStatus("Adresse suggérée validée.", "ok");
}

function debounceLocationSuggestions(query) {
  if (locationSuggestTimeoutId) clearTimeout(locationSuggestTimeoutId);
  if (!query || query.length < 3) {
    hideLocationSuggestions();
    return;
  }
  locationSuggestTimeoutId = setTimeout(() => {
    chrome.runtime.sendMessage(
      { type: "PLACES_AUTOCOMPLETE", payload: { input: query } },
      (res) => {
        if (chrome.runtime.lastError) return;
        if (!res?.ok) {
          const msg = res?.error || "";
          if (msg) setLocationStatus(msg, "error");
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
    return;
  }
  chrome.runtime.sendMessage(
    { type: "PLACES_GEOCODE", payload: { address } },
    (res) => {
      if (chrome.runtime.lastError) return;
      if (!res?.ok) {
        setLocationStatus(res?.error || "Adresse non vérifiée.", "error");
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
  if (eventUseMeetEl) eventUseMeetEl.checked = false;
  if (eventSendInvitesEl) eventSendInvitesEl.checked = true;
  clearAttendeesField();
  hideLocationSuggestions();
  selectedLocationInfo = null;
  setLocationStatus("", null);
  setLocationValidityClass(null);
  prefillEventForm();
  setEventFormStatus(message || "Opération réussie.", "ok");
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
    setLocationValidityClass(null);
    setLocationStatus("", null);
  }
  if (eventDescriptionEl) eventDescriptionEl.value = ev.description || "";

  const start = ev.start ? new Date(ev.start) : null;
  const end = ev.end ? new Date(ev.end) : null;
  if (start && !Number.isNaN(start.getTime()) && eventStartEl) {
    eventStartEl.value = toDateTimeLocalValue(start);
  }
  if (end && !Number.isNaN(end.getTime()) && eventEndEl) {
    eventEndEl.value = toDateTimeLocalValue(end);
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
  editingEvent = ev;
  toggleEventForm(true);
  prefillFormFromEvent(ev);
  setEventFormStatus("Mode modification.", null);
  if (eventSummaryEl) eventSummaryEl.focus();
}

function applyDurationFromStart(minutes) {
  if (!eventStartEl || !eventEndEl) return;
  const start = parseDateTimeLocal(eventStartEl.value);
  if (!start) return;
  const end = new Date(start);
  end.setMinutes(end.getMinutes() + minutes);
  eventEndEl.value = toDateTimeLocalValue(end);
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

function prefillEventForm() {
  if (!eventStartEl || !eventEndEl) return;
  const base = parseDateInput(dateEl.value);
  base.setHours(9, 0, 0, 0);
  const end = new Date(base);
  end.setHours(base.getHours() + 1);
  eventStartEl.value = toDateTimeLocalValue(base);
  eventEndEl.value = toDateTimeLocalValue(end);
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

  const start = parseDateTimeLocal(eventStartEl?.value);
  const end = parseDateTimeLocal(eventEndEl?.value);
  if (!start || !end || end <= start) {
    setEventFormStatus("Dates invalides.", "error");
    return;
  }

  const { attendees, invalid: invalidEmails } = verifyAttendeesField();
  if (invalidEmails.length) {
    setEventFormStatus(`Emails invalides: ${invalidEmails.slice(0, 3).join(", ")}`, "error");
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

  const payload = {
    summary,
    location: normalizeText(eventLocationEl?.value || ""),
    description: normalizeText(eventDescriptionEl?.value || ""),
    start: { dateTime: start.toISOString(), timeZone },
    end: { dateTime: end.toISOString(), timeZone },
    attendees,
    useMeet: !!eventUseMeetEl?.checked,
    sendUpdates,
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
    }
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

function rangeForView(date, mode) {
  const start = new Date(date);
  const end = new Date(date);

  if (mode === "week") {
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
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  dateEl.value = `${y}-${m}-${day}`;
}

function shiftDate(direction) {
  const current = parseDateInput(dateEl.value);
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

function getCalendarColor(calendarId) {
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

function passesFilters(ev) {
  const q = normalizeText(searchEl?.value || "").toLowerCase();
  if (q) {
    const hay = `${ev.summary || ""} ${ev.location || ""} ${ev.calendarSummary || ""}`.toLowerCase();
    if (!hay.includes(q)) return false;
  }
  if (meetingFilter === "all") return true;
  return getMeetingType(ev.meetingLink) === meetingFilter;
}

function makeEventChip(ev) {
  const chip = document.createElement("div");
  chip.className = "event-chip";
  chip.style.borderLeftColor = getCalendarColor(ev.calendarId);
  chip.tabIndex = 0;

  const title = document.createElement("div");
  title.className = "event-title";
  title.textContent = normalizeText(ev.summary || "Evenement");

  const meta = document.createElement("div");
  meta.className = "event-meta";
  const timeStr = formatEventTime(ev);
  meta.textContent = timeStr || "";

  chip.appendChild(title);
  if (meta.textContent) chip.appendChild(meta);

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
  if (!items || items.length === 0) {
    eventsStatusEl.textContent = "Aucun evenement dans cette periode.";
    return;
  }
  eventsStatusEl.textContent = "";

  const groups = new Map();
  items.filter(passesFilters).forEach((ev) => {
    const key = getEventDateKey(ev);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(ev);
  });

  const baseDate = parseDateInput(dateEl.value);
  if (viewMode === "day") {
    const key = dateKey(baseDate);
    const dayEvents = groups.get(key) || [];
    dayEvents.forEach((ev) => eventsEl.appendChild(makeEventChip(ev)));
    return;
  }

  if (viewMode === "week") {
    const start = weekStart(baseDate);
    const header = document.createElement("div");
    header.className = "calendar-week";
    for (let i = 0; i < 7; i += 1) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      const label = document.createElement("div");
      label.className = "day-header";
      label.textContent = d.toLocaleDateString(undefined, { weekday: "short", day: "numeric" });
      header.appendChild(label);
    }
    eventsEl.appendChild(header);

    const grid = document.createElement("div");
    grid.className = "calendar-week";
    for (let i = 0; i < 7; i += 1) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      const cell = document.createElement("div");
      cell.className = "day-cell";
      const key = dateKey(d);
      if (isTodayKey(key)) {
        cell.classList.add("today");
      }
      const dayEvents = groups.get(key) || [];
      dayEvents.forEach((ev) => cell.appendChild(makeEventChip(ev)));
      grid.appendChild(cell);
    }
    eventsEl.appendChild(grid);
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
    dayEvents.slice(0, 3).forEach((ev) => cell.appendChild(makeEventChip(ev)));
    if (dayEvents.length > 3) {
      const more = document.createElement("div");
      more.className = "event-meta";
      more.textContent = `+${dayEvents.length - 3}`;
      cell.appendChild(more);
    }
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
  items.filter(passesFilters).forEach((ev) => nextEventsEl.appendChild(makeEventChip(ev)));
}

function loadNextEvents() {
  const now = new Date();
  const timeMin = now.toISOString();
  const timeMax = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString();
  nextStatusEl.textContent = "Chargement...";

  chrome.runtime.sendMessage(
    { type: "GCAL_LOAD_EVENTS", payload: { timeMin, timeMax, calendarIds: selectedIds } },
    (res) => {
      if (chrome.runtime.lastError) {
        nextStatusEl.textContent = `Erreur: ${chrome.runtime.lastError.message}`;
        return;
      }
      if (!res?.ok) {
        const err = res?.error || "inconnue";
        nextStatusEl.textContent =
          err === "AUTH_REQUIRED"
            ? "Non connecte. Connecte Google dans Options."
            : `Erreur: ${err}`;
        return;
      }
      const next = (res.events || []).slice(0, 3);
      renderNextEvents(next);
    }
  );
}

function loadCalendars() {
  calendarStatusEl.textContent = "Chargement...";
  chrome.runtime.sendMessage({ type: "GCAL_AUTH_STATUS" }, (auth) => {
    if (!auth?.connected) {
      calendarStatusEl.textContent = "Non connecte. Connecte Google dans Options.";
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
  const date = parseDateInput(dateEl.value);
  const { timeMin, timeMax } = rangeForView(date, viewMode);
  const now = new Date();
  const min = new Date(timeMin);
  const effectiveMin = min < now ? now : min;
  eventsStatusEl.textContent = "Chargement...";

  chrome.runtime.sendMessage(
    { type: "GCAL_LOAD_EVENTS", payload: { timeMin: effectiveMin.toISOString(), timeMax, calendarIds: selectedIds } },
    (res) => {
      if (chrome.runtime.lastError) {
        eventsStatusEl.textContent = `Erreur: ${chrome.runtime.lastError.message}`;
        return;
      }
      if (!res?.ok) {
        const err = res?.error || "inconnue";
        eventsStatusEl.textContent =
          err === "AUTH_REQUIRED"
            ? "Non connecte. Connecte Google dans Options."
            : `Erreur: ${err}`;
        return;
      }
      renderEvents(res.events || []);
    }
  );
  }, 150);
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

refreshBtn.addEventListener("click", loadEvents);
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
    const start = parseDateTimeLocal(eventStartEl.value);
    const end = parseDateTimeLocal(eventEndEl?.value);
    if (!start) return;
    if (!end || end <= start) {
      applyDurationFromStart(60);
    }
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

dateEl.value = todayLocalDateInput();
loadCalendars();



