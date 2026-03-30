#!/bin/zsh

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
EXT_CONFIG="${ROOT_DIR}/config.js"
OUTPUT_PATH="${1:-${ROOT_DIR}/packaging/connections-config.extension.txt}"

if [[ ! -f "${EXT_CONFIG}" ]]; then
  echo "Missing extension config: ${EXT_CONFIG}" >&2
  exit 1
fi

export EXT_CONFIG

osascript -l JavaScript <<'EOF' > "${OUTPUT_PATH}"
ObjC.import('Foundation');

function env(name) {
  return ObjC.unwrap($.NSProcessInfo.processInfo.environment.objectForKey(name));
}

function deepMerge(base, override) {
  var out = {};
  Object.keys(base).forEach(function(key) {
    out[key] = base[key];
  });
  if (!override) {
    return out;
  }
  Object.keys(override).forEach(function(key) {
    out[key] = override[key];
  });
  return out;
}

var path = env('EXT_CONFIG');
var script = ObjC.unwrap($.NSString.stringWithContentsOfFileEncodingError(path, $.NSUTF8StringEncoding, null));
var context = { self: {} };
(function() {
  with (context) {
    eval(script);
  }
})();

var defaults = context.self.EXTENSION_DEFAULTS || {};
var sync = defaults.sync || {};
var local = defaults.local || {};
var reminderPrefs = local.gcalReminderPrefs || {};
var marketPrefs = local.yahooNewsPrefs || {};

var notionFieldMapDefaults = {
  jobTitle: 'Job Title',
  company: 'Entreprise',
  location: 'Lieu',
  url: 'lien offre',
  status: 'Status',
  closeDate: 'Date de fermeture',
  notes: 'Notes'
};

var notionStatusMapDefaults = {
  open: 'Ouvert',
  applied: 'Candidature',
  interview: 'Entretien',
  rejected: 'Refuse'
};

var snapshot = {
  format: 'notion-dashboard-swift-connections-v1',
  exportedAt: (new Date()).toISOString(),
  includesSensitiveData: true,
  config: {
    notionToken: sync.notionToken || '',
    notionDbId: sync.notionDbId || '',
    notionTodoDbId: sync.notionTodoDbId || '',
    bdfApiKey: local.bdfApiKey || '',
    googlePlacesApiKey: local.googlePlacesApiKey || '',
    googleOAuthClientID: '608348086080-dp8647muci5st4em00pdgvrba75jq3db.apps.googleusercontent.com',
    googleOAuthRedirectURI: 'com.googleusercontent.apps.608348086080-dp8647muci5st4em00pdgvrba75jq3db:/oauth2redirect',
    googleOAuthScopes: [
      'https://www.googleapis.com/auth/calendar.readonly',
      'https://www.googleapis.com/auth/calendar.events'
    ],
    googleAccessToken: '',
    googleRefreshToken: '',
    googleTokenExpiration: null,
    googleSelectedCalendarIDs: local.gcalSelectedCalendars || [],
    googleDefaultCalendarID: local.gcalDefaultCalendar === 'primary' ? '' : (local.gcalDefaultCalendar || ''),
    externalIcalUrl: local.externalIcalUrl || '',
    pipelineAutoImportEnabled: true,
    focusModeEnabled: !!local.focusModeEnabled,
    pomodoroWorkMinutes: local.pomodoroWork || 25,
    pomodoroBreakMinutes: local.pomodoroBreak || 5,
    urlBlockerRules: local.urlBlockerRules || [],
    reminderPrefs: {
      defaultMinutes: reminderPrefs.default || [30],
      meetingMinutes: reminderPrefs.meeting || [30],
      interviewMinutes: reminderPrefs.entretien || reminderPrefs.interview || [120, 30],
      deadlineMinutes: reminderPrefs.deadline || [1440, 60]
    },
    marketSymbols: marketPrefs.symbols || ['^GSPC', 'EURUSD=X', 'BTC-USD'],
    newsEnabled: local.dashboardWidgets ? local.dashboardWidgets.news !== false : true,
    marketsEnabled: local.dashboardWidgets ? local.dashboardWidgets.markets !== false : true,
    notionFieldMap: deepMerge(notionFieldMapDefaults, sync.notionFieldMap),
    notionStatusMap: deepMerge(notionStatusMapDefaults, sync.notionStatusMap),
    wipLimits: {
      open: 20,
      applied: 15,
      interview: 8,
      rejected: 999
    }
  }
};

JSON.stringify(snapshot, null, 2);
EOF

if [[ ! -s "${OUTPUT_PATH}" ]]; then
  echo "Generated snapshot is empty: ${OUTPUT_PATH}" >&2
  exit 1
fi
