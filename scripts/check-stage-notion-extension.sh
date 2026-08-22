#!/bin/zsh

readonly EXTENSION_ID="inmhhgbfdkbebnbekdbohpjaamplhbfa"
readonly EXTENSION_NAME="Stage → Notion"
readonly EXPECTED_PATH="/Users/ludovicsaint-yves/Desktop/Cours/Projet/Notion-Extension"
readonly PREFERENCES_FILE="/Users/ludovicsaint-yves/Library/Application Support/Google/Chrome/Profile 1/Secure Preferences"
readonly ALERT_MARKER="/tmp/local.chrome.stage-notion-extension.alerted"

notify_disabled() {
  # Only alert once per incident; the marker is cleared when the extension is active again.
  if [[ ! -e "$ALERT_MARKER" ]]; then
    /usr/bin/touch "$ALERT_MARKER"
    /usr/bin/osascript -e \
      "display notification \"Ouvre chrome://extensions pour la réactiver.\" with title \"${EXTENSION_NAME} est désactivée\""
    /usr/bin/open -a "Google Chrome" "chrome://extensions/?id=${EXTENSION_ID}"
  fi
}

if [[ ! -r "$PREFERENCES_FILE" ]]; then
  print -u2 -- "Profil Chrome introuvable : $PREFERENCES_FILE"
  notify_disabled
  exit 1
fi

installed_path=$(/usr/bin/plutil -extract \
  "extensions.settings.${EXTENSION_ID}.path" raw -o - "$PREFERENCES_FILE" 2>/dev/null)

if [[ "$installed_path" != "$EXPECTED_PATH" ]]; then
  print -u2 -- "Extension absente du profil Chrome Profile 1."
  notify_disabled
  exit 1
fi

# Chrome omet la clé `state` pour cette extension non empaquetée lorsqu'elle est active.
# Si elle existe, la valeur 1 signifie également qu'elle est active.
extension_state=$(/usr/bin/plutil -extract \
  "extensions.settings.${EXTENSION_ID}.state" raw -o - "$PREFERENCES_FILE" 2>/dev/null)

if [[ -z "$extension_state" || "$extension_state" == "1" ]]; then
  /bin/rm -f "$ALERT_MARKER"
  print -- "${EXTENSION_NAME} est active."
  exit 0
fi

print -u2 -- "${EXTENSION_NAME} est désactivée (état Chrome : ${extension_state})."
notify_disabled
exit 1
