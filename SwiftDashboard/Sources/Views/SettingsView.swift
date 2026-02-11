import SwiftUI
import UniformTypeIdentifiers

struct SettingsView: View {
  @EnvironmentObject private var configStore: ConfigStore
  @EnvironmentObject private var stageStore: StageStore
  @EnvironmentObject private var googleAuthStore: GoogleAuthStore
  @EnvironmentObject private var calendarStore: CalendarStore
  @EnvironmentObject private var notificationScheduler: NotificationScheduler
  @EnvironmentObject private var focusStore: FocusStore
  @EnvironmentObject private var marketNewsStore: MarketNewsStore
  @EnvironmentObject private var diagnosticsStore: DiagnosticsStore

  @State private var exportDocument = ConnectionsTextDocument()
  @State private var showExporter = false
  @State private var showImporter = false
  @State private var manualConnectionsText: String = ""
  @State private var statusMessage: String = ""
  @State private var urlRuleInput: String = ""
  @State private var marketSymbolsText: String = ""

  var body: some View {
    NavigationStack {
      Form {
        notionSection
        apiSection
        googleSection
        calendarSection
        reminderSection
        focusSection
        marketNewsSection
        mappingSection
        wipSection
        importExportSection
        diagnosticsSection
      }
      .navigationTitle("Settings")
    }
    .fileExporter(
      isPresented: $showExporter,
      document: exportDocument,
      contentType: .plainText,
      defaultFilename: "connections-config-\(fileStamp())"
    ) { result in
      switch result {
      case .success:
        statusMessage = "Connections exported to .txt."
      case let .failure(error):
        statusMessage = "Export failed: \(error.localizedDescription)"
      }
    }
    .fileImporter(
      isPresented: $showImporter,
      allowedContentTypes: [.plainText, .json],
      allowsMultipleSelection: false
    ) { result in
      switch result {
      case let .success(urls):
        guard let url = urls.first else { return }
        importFromFile(url: url)
      case let .failure(error):
        statusMessage = "Import failed: \(error.localizedDescription)"
      }
    }
    .onAppear {
      if manualConnectionsText.isEmpty {
        manualConnectionsText = (try? configStore.exportConnectionsText()) ?? ""
      }
      marketSymbolsText = configStore.config.marketSymbols.joined(separator: ",")
      Task { await notificationScheduler.refreshAuthorizationStatus() }
    }
  }

  private var notionSection: some View {
    Section("Notion") {
      TextField("Notion token", text: binding(for: \.notionToken))
        .plainTextInputBehavior()
      TextField("Notion database ID or URL", text: binding(for: \.notionDbId))
        .plainTextInputBehavior()
      TextField("Notion Todo database ID or URL", text: binding(for: \.notionTodoDbId))
        .plainTextInputBehavior()

      HStack {
        Button("Test connection") {
          Task {
            statusMessage = await stageStore.testNotionConnection()
          }
        }
        .buttonStyle(.bordered)

        Button("Sync from Notion") {
          Task { await stageStore.syncFromNotion() }
        }
        .buttonStyle(.borderedProminent)
        .tint(.teal)

        Button("Push local to Notion") {
          Task { await stageStore.pushAllToNotion() }
        }
        .buttonStyle(.bordered)

        Button("Flush queue (\(stageStore.pendingQueueCount))") {
          Task { await stageStore.flushPendingOperations() }
        }
        .buttonStyle(.bordered)
      }

      if !stageStore.syncMessage.isEmpty {
        Text(stageStore.syncMessage)
          .font(.caption)
          .foregroundStyle(.secondary)
      }
    }
  }

  private var apiSection: some View {
    Section("API keys and pipeline") {
      TextField("Banque de France API key", text: binding(for: \.bdfApiKey))
        .plainTextInputBehavior()
      TextField("Google Places API key", text: binding(for: \.googlePlacesApiKey))
        .plainTextInputBehavior()
      Toggle("Pipeline auto-import enabled", isOn: binding(for: \.pipelineAutoImportEnabled))
    }
  }

  private var googleSection: some View {
    Section("Google OAuth") {
      TextField("Google OAuth client ID", text: binding(for: \.googleOAuthClientID))
        .plainTextInputBehavior()
      TextField("Google OAuth redirect URI", text: binding(for: \.googleOAuthRedirectURI))
        .plainTextInputBehavior()
      TextField(
        "Scopes (comma separated)",
        text: binding(
          get: { configStore.config.googleOAuthScopes.joined(separator: ",") },
          set: { value in
            let scopes = value
              .split(separator: ",")
              .map { String($0).trimmingCharacters(in: .whitespacesAndNewlines) }
              .filter { !$0.isEmpty }
            configStore.update { $0.googleOAuthScopes = scopes }
          }
        )
      )
      .plainTextInputBehavior()

      HStack {
        Button(googleAuthStore.isAuthenticated ? "Reconnect Google" : "Connect Google") {
          Task { await googleAuthStore.signInInteractive() }
        }
        .buttonStyle(.borderedProminent)
        .tint(.teal)

        Button("Disconnect") {
          googleAuthStore.signOut()
        }
        .buttonStyle(.bordered)
        .disabled(!googleAuthStore.isAuthenticated)

        Button("Load calendars") {
          Task { await calendarStore.loadGoogleCalendars() }
        }
        .buttonStyle(.bordered)
      }

      if !calendarStore.googleCalendars.isEmpty {
        Picker("Default calendar", selection: binding(for: \.googleDefaultCalendarID)) {
          Text("Primary").tag("")
          ForEach(calendarStore.googleCalendars) { cal in
            Text(cal.name).tag(cal.id)
          }
        }
      }

      Text(googleAuthStore.statusMessage)
        .font(.caption)
        .foregroundStyle(.secondary)
    }
  }

  private var calendarSection: some View {
    Section("Calendar") {
      TextField("External iCal URL", text: binding(for: \.externalIcalUrl))
        .plainTextInputBehavior()
      Text("iCal URL is used in Calendar tab to load events.")
        .font(.caption)
        .foregroundStyle(.secondary)

      Button("Request notification permission") {
        Task { await notificationScheduler.requestAuthorization() }
      }
      .buttonStyle(.bordered)

      Text(notificationScheduler.lastStatusMessage)
        .font(.caption)
        .foregroundStyle(.secondary)
    }
  }

  private var reminderSection: some View {
    Section("Reminder preferences (minutes)") {
      TextField("Default", text: reminderBinding(\.defaultMinutes))
        .plainTextInputBehavior()
      TextField("Meeting", text: reminderBinding(\.meetingMinutes))
        .plainTextInputBehavior()
      TextField("Interview", text: reminderBinding(\.interviewMinutes))
        .plainTextInputBehavior()
      TextField("Deadline", text: reminderBinding(\.deadlineMinutes))
        .plainTextInputBehavior()
      Button("Reschedule reminders now") {
        Task {
          await notificationScheduler.scheduleEventReminders(
            events: calendarStore.events,
            prefs: configStore.config.reminderPrefs
          )
        }
      }
      .buttonStyle(.borderedProminent)
      .tint(.teal)
    }
  }

  private var focusSection: some View {
    Section("Focus mode / URL blocker") {
      Toggle(
        "Enable focus mode",
        isOn: Binding(
          get: { configStore.config.focusModeEnabled },
          set: { enabled in
            configStore.update { $0.focusModeEnabled = enabled }
            focusStore.setEnabled(enabled)
          }
        )
      )
      Stepper(
        "Pomodoro work: \(configStore.config.pomodoroWorkMinutes)m",
        value: binding(for: \.pomodoroWorkMinutes),
        in: 5 ... 120
      )
      Stepper(
        "Pomodoro break: \(configStore.config.pomodoroBreakMinutes)m",
        value: binding(for: \.pomodoroBreakMinutes),
        in: 1 ... 60
      )

      HStack {
        TextField("Add blocked rule (ex: youtube.com)", text: $urlRuleInput)
          .plainTextInputBehavior()
        Button("Add") {
          let clean = urlRuleInput.trimmingCharacters(in: .whitespacesAndNewlines)
          guard !clean.isEmpty else { return }
          if !configStore.config.urlBlockerRules.contains(clean) {
            configStore.update { $0.urlBlockerRules.append(clean) }
          }
          urlRuleInput = ""
        }
        .buttonStyle(.bordered)
      }

      ForEach(configStore.config.urlBlockerRules, id: \.self) { rule in
        HStack {
          Text(rule).font(.caption)
          Spacer()
          Button(role: .destructive) {
            configStore.update { config in
              config.urlBlockerRules.removeAll { $0 == rule }
            }
          } label: {
            Image(systemName: "xmark.circle.fill")
          }
          .buttonStyle(.plain)
        }
      }

      HStack {
        Button("Start focus session") { focusStore.startSession() }
          .buttonStyle(.borderedProminent)
          .tint(.orange)
        Button("Stop") { focusStore.stopSession() }
          .buttonStyle(.bordered)
      }
      Text("Phase: \(focusStore.phase.rawValue) | Remaining: \(max(0, focusStore.remainingSeconds / 60))m")
        .font(.caption)
        .foregroundStyle(.secondary)
    }
  }

  private var marketNewsSection: some View {
    Section("News / Markets") {
      Toggle("Enable news", isOn: binding(for: \.newsEnabled))
      Toggle("Enable markets", isOn: binding(for: \.marketsEnabled))
      TextField("Market symbols (comma separated)", text: $marketSymbolsText)
        .plainTextInputBehavior()
        .onChange(of: marketSymbolsText) { value in
          let symbols = value
            .split(separator: ",")
            .map { String($0).trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty }
          configStore.update { $0.marketSymbols = symbols }
        }

      Button("Refresh news + markets") {
        Task { await marketNewsStore.refreshAll() }
      }
      .buttonStyle(.bordered)
    }
  }

  private var diagnosticsSection: some View {
    Section("Diagnostics") {
      HStack {
        Text("Queue offline: \(stageStore.pendingQueueCount)")
        Spacer()
        Button("Clear logs") { diagnosticsStore.clear() }
          .buttonStyle(.bordered)
      }
      if stageStore.pendingQueueCount > 0 {
        ForEach(stageStore.pendingOperations.prefix(20)) { op in
          HStack {
            Text(op.kind.rawValue)
              .font(.caption.weight(.semibold))
            Spacer()
            Text("retry: \(op.retryCount)")
              .font(.caption2)
              .foregroundStyle(.secondary)
          }
        }
      }
      if diagnosticsStore.entries.isEmpty {
        Text("No diagnostics yet.")
          .font(.caption)
          .foregroundStyle(.secondary)
      } else {
        ForEach(diagnosticsStore.entries.prefix(25)) { entry in
          VStack(alignment: .leading, spacing: 2) {
            HStack {
              Text(entry.category)
                .font(.caption.weight(.semibold))
              Spacer()
              Text(entry.createdAt.shortDateTime)
                .font(.caption2)
                .foregroundStyle(.secondary)
            }
            Text(entry.message)
              .font(.caption)
            if !entry.metadata.isEmpty {
              Text(entry.metadata.map { "\($0.key)=\($0.value)" }.joined(separator: " | "))
                .font(.caption2)
                .foregroundStyle(.secondary)
            }
          }
        }
      }
    }
  }

  private var mappingSection: some View {
    Section("Notion field mapping") {
      TextField(
        "Job title field",
        text: mapBinding(\.jobTitle, fallback: "Job Title")
      )
      TextField(
        "Company field",
        text: mapBinding(\.company, fallback: "Entreprise")
      )
      TextField(
        "Location field",
        text: mapBinding(\.location, fallback: "Lieu")
      )
      TextField(
        "URL field",
        text: mapBinding(\.url, fallback: "lien offre")
      )
      TextField(
        "Status field",
        text: mapBinding(\.status, fallback: "Status")
      )
      TextField(
        "Notes field",
        text: mapBinding(\.notes, fallback: "Notes")
      )
      TextField(
        "Close date field",
        text: mapBinding(\.closeDate, fallback: "Date de fermeture")
      )

      Divider()

      TextField("Open status name", text: statusMapBinding(\.open, fallback: "Ouvert"))
      TextField("Applied status name", text: statusMapBinding(\.applied, fallback: "Candidature"))
      TextField("Interview status name", text: statusMapBinding(\.interview, fallback: "Entretien"))
      TextField("Rejected status name", text: statusMapBinding(\.rejected, fallback: "Refuse"))
    }
  }

  private var wipSection: some View {
    Section("WIP limits") {
      ForEach(StageStatus.allCases) { status in
        Stepper(
          "\(status.rawValue): \(configStore.config.wipLimit(for: status))",
          value: wipBinding(for: status),
          in: 1 ... 999
        )
      }
    }
  }

  private var importExportSection: some View {
    Section("Import / Export connections") {
      Text("This export contains sensitive data (tokens and API keys).")
        .font(.caption)
        .foregroundStyle(.orange)

      HStack {
        Button("Export .txt") {
          do {
            let text = try configStore.exportConnectionsText()
            manualConnectionsText = text
            exportDocument = ConnectionsTextDocument(text: text)
            showExporter = true
          } catch {
            statusMessage = "Export preparation failed: \(error.localizedDescription)"
          }
        }
        .buttonStyle(.borderedProminent)
        .tint(.teal)

        Button("Import file") {
          showImporter = true
        }
        .buttonStyle(.bordered)
      }

      TextEditor(text: $manualConnectionsText)
        .font(.system(.footnote, design: .monospaced))
        .frame(minHeight: 180)

      HStack {
        Button("Import text") {
          do {
            try configStore.importConnectionsText(manualConnectionsText)
            marketSymbolsText = configStore.config.marketSymbols.joined(separator: ",")
            googleAuthStore.refreshAuthState()
            calendarStore.selectedCalendarIDs = Set(configStore.config.googleSelectedCalendarIDs)
            statusMessage = "Connections imported from text."
          } catch {
            statusMessage = "Import text failed: \(error.localizedDescription)"
          }
        }
        .buttonStyle(.bordered)

        Button("Refresh text from current config") {
          manualConnectionsText = (try? configStore.exportConnectionsText()) ?? ""
        }
        .buttonStyle(.bordered)
      }

      if !statusMessage.isEmpty {
        Text(statusMessage)
          .font(.caption)
          .foregroundStyle(.secondary)
      }
    }
  }

  private func importFromFile(url: URL) {
    do {
      let secured = url.startAccessingSecurityScopedResource()
      defer {
        if secured {
          url.stopAccessingSecurityScopedResource()
        }
      }

      let data = try Data(contentsOf: url)
      guard let text = String(data: data, encoding: .utf8) else {
        statusMessage = "Import failed: invalid file encoding."
        return
      }
      try configStore.importConnectionsText(text)
      manualConnectionsText = text
      marketSymbolsText = configStore.config.marketSymbols.joined(separator: ",")
      googleAuthStore.refreshAuthState()
      calendarStore.selectedCalendarIDs = Set(configStore.config.googleSelectedCalendarIDs)
      statusMessage = "Connections imported from file."
    } catch {
      statusMessage = "Import failed: \(error.localizedDescription)"
    }
  }

  private func fileStamp(date: Date = Date()) -> String {
    let formatter = DateFormatter()
    formatter.dateFormat = "yyyyMMdd-HHmmss"
    return formatter.string(from: date)
  }

  private func binding<Value>(for keyPath: WritableKeyPath<AppConfig, Value>) -> Binding<Value> {
    Binding(
      get: { configStore.config[keyPath: keyPath] },
      set: { newValue in
        configStore.update { config in
          config[keyPath: keyPath] = newValue
        }
      }
    )
  }

  private func binding(get: @escaping () -> String, set: @escaping (String) -> Void) -> Binding<String> {
    Binding(
      get: get,
      set: set
    )
  }

  private func mapBinding(_ keyPath: WritableKeyPath<NotionFieldMap, String>, fallback: String) -> Binding<String> {
    binding(
      get: { configStore.config.notionFieldMap[keyPath: keyPath] },
      set: { newValue in
        configStore.update { config in
          let clean = newValue.trimmingCharacters(in: .whitespacesAndNewlines)
          config.notionFieldMap[keyPath: keyPath] = clean.isEmpty ? fallback : clean
        }
      }
    )
  }

  private func reminderBinding(_ keyPath: WritableKeyPath<ReminderPrefs, [Int]>) -> Binding<String> {
    binding(
      get: {
        configStore.config.reminderPrefs[keyPath: keyPath]
          .map(String.init)
          .joined(separator: ",")
      },
      set: { newValue in
        let list = newValue
          .split(separator: ",")
          .compactMap { Int($0.trimmingCharacters(in: .whitespacesAndNewlines)) }
          .filter { $0 > 0 }
        configStore.update { config in
          config.reminderPrefs[keyPath: keyPath] = list.isEmpty ? ReminderPrefs.defaults[keyPath: keyPath] : list
        }
      }
    )
  }

  private func statusMapBinding(_ keyPath: WritableKeyPath<NotionStatusMap, String>, fallback: String) -> Binding<String> {
    binding(
      get: { configStore.config.notionStatusMap[keyPath: keyPath] },
      set: { newValue in
        configStore.update { config in
          let clean = newValue.trimmingCharacters(in: .whitespacesAndNewlines)
          config.notionStatusMap[keyPath: keyPath] = clean.isEmpty ? fallback : clean
        }
      }
    )
  }

  private func wipBinding(for status: StageStatus) -> Binding<Int> {
    Binding(
      get: { configStore.config.wipLimit(for: status) },
      set: { newValue in
        configStore.update { config in
          config.wipLimits[status.key] = newValue
        }
      }
    )
  }
}
