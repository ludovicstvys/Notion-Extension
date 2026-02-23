/*
  WARNING: Sensitive values stored here are bundled with the extension.
  Keep this file private and avoid committing real secrets to public repos.
*/

self.EXTENSION_DEFAULTS = {
  sync: {
    // Notion
    notionToken: "",
    notionDbId: "",
    notionTodoDbId: "",
    notionFieldMap: {},
    notionStatusMap: {
      open: "Ouvert",
      applied: "Candidature envoyee",
    },
  },
  local: {
    // API keys
    bdfApiKey: "",
    googlePlacesApiKey: "",

    // Calendar
    gcalDefaultCalendar: "primary",
    gcalSelectedCalendars: [],
    gcalNotifyCalendars: [],
    externalIcalUrl: "",
    gcalReminderPrefs: {
      default: [30],
      meeting: [30],
      entretien: [120, 30],
      deadline: [1440, 60],
    },
    // News + widgets + focus
    yahooNewsPrefs: {
      symbols: ["^GSPC"],
      region: "US",
      lang: "en-US",
      category: "",
      quickMode: false,
    },
    dashboardWidgets: {
      events: true,
      add: true,
      focus: true,
      todo: true,
      news: true,
      markets: true,
      todoNotion: true,
    },
    focusModeEnabled: false,
    pomodoroWork: 25,
    pomodoroBreak: 5,

    // Notion sync + tags + deadlines
    notionCalendarSyncEnabled: false,
    autoTagRules: [
      { tag: "meeting", contains: ["meet.google.com", "zoom.us", "teams.microsoft.com"] },
      { tag: "deadline", contains: ["deadline", "due", "date limite"] },
      { tag: "entretien", contains: ["interview", "entretien"] },
      { tag: "important", contains: ["urgent", "important"] },
    ],
    deadlinePrefs: { enabled: true, offsets: [24, 72, 168] },

    // URL blocker
    urlBlockerRules: [],
    urlBlockerEnabled: true,
  },
};
