#!/bin/zsh

# launchd has a minimal environment, so use absolute command paths.
if ! /usr/bin/pgrep -x "Opal" >/dev/null 2>&1; then
  /usr/bin/open -b "com.withopal.opalmacos"
fi
