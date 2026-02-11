# Notion Dashboard Swift (iOS + macOS)

This folder contains a full SwiftUI app scaffolded for both iOS and macOS.

## What is included

- Dashboard view (KPI, blockers, data quality, todos)
- Stages view with Kanban + WIP limits
- Stage automation:
  - Open stage creates todo with deadline J+3
  - Applied/interview statuses can create follow-up todos
- Calendar view from external iCal URL
- Google OAuth (PKCE) + Google Calendar fetch
- Local notifications with reminder offsets and snooze actions
- Focus mode + URL blocker (in-app link blocking while focus is active)
- News + Markets widgets (Yahoo feeds)
- Pipeline import (LinkedIn/Welcome/JobTeaser) from URL/clipboard with parsing
- Settings view for all connections:
  - Notion token / DB IDs
  - Google OAuth client ID / redirect URI / scopes
  - API keys
  - iCal link
  - Pipeline toggle
  - Field/status mapping
- Notion robustness:
  - retry with backoff on transient failures/rate-limit
  - offline queue for pending write operations
  - diagnostics logs in Settings
- Import/Export of all connection parameters into a `.txt` file
- Notion client for fetch/upsert/status update

## Generate and run on Mac

1. Install Xcode 15+.
2. Install XcodeGen:
   - `brew install xcodegen`
3. In this folder:
   - `xcodegen generate`
4. Open project:
   - `open NotionDashboardSwift.xcodeproj`
5. Run either target:
   - `NotionDashboard-iOS`
   - `NotionDashboard-macOS`

## Google OAuth setup

1. In Google Cloud Console, create an OAuth client for installed apps.
2. Add redirect URI scheme used by the app: `notiondash://oauth2redirect`.
3. In Settings tab, set:
   - `Google OAuth client ID`
   - `Google OAuth redirect URI`
   - scopes if needed
4. Click `Connect Google`.

## Security note

The exported `.txt` configuration contains sensitive data (tokens and API keys).
Store it securely.
