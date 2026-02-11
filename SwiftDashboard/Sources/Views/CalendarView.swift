import SwiftUI

struct CalendarView: View {
  @EnvironmentObject private var calendarStore: CalendarStore
  @EnvironmentObject private var configStore: ConfigStore
  @EnvironmentObject private var googleAuthStore: GoogleAuthStore
  @EnvironmentObject private var notificationScheduler: NotificationScheduler
  @State private var iCalURL: String = ""
  @State private var selectedEvent: CalendarEvent?
  @State private var showCreateGoogleEvent = false

  var body: some View {
    NavigationStack {
      VStack(spacing: 12) {
        VStack(alignment: .leading, spacing: 8) {
          HStack {
            Text("Google Calendar")
              .font(.headline)
            Spacer()
            Text(googleAuthStore.statusMessage)
              .font(.caption)
              .foregroundStyle(.secondary)
          }

          HStack(spacing: 8) {
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

            Button("Notifications") {
              Task { await notificationScheduler.requestAuthorization() }
            }
            .buttonStyle(.bordered)
          }

          if googleAuthStore.isAuthenticated {
            ScrollView(.horizontal) {
              HStack(spacing: 8) {
                ForEach(calendarStore.googleCalendars) { cal in
                  let selected = calendarStore.selectedCalendarIDs.contains(cal.id)
                  Button {
                    calendarStore.setCalendarSelected(calendarID: cal.id, isSelected: !selected)
                  } label: {
                    Text(cal.name)
                      .font(.caption.weight(.semibold))
                      .padding(.horizontal, 10)
                      .padding(.vertical, 6)
                      .background(selected ? Color.teal.opacity(0.2) : Color.white.opacity(0.08))
                      .clipShape(Capsule())
                  }
                  .buttonStyle(.plain)
                }
              }
            }
          }
        }
        .padding(.horizontal, 16)
        .padding(.top, 12)

        HStack(spacing: 8) {
          TextField("https://.../agenda/ical/...", text: $iCalURL)
            .textFieldStyle(.roundedBorder)
            .font(.subheadline.monospaced())

          Button("Load all") {
            Task {
              configStore.update { $0.externalIcalUrl = iCalURL }
              await calendarStore.loadCombinedEvents(icalURL: iCalURL)
            }
          }
          .buttonStyle(.borderedProminent)
          .tint(.teal)

            Button("Google only") {
              Task {
                await calendarStore.loadGoogleCalendars()
                await calendarStore.loadCombinedEvents(icalURL: "")
              }
            }
            .buttonStyle(.bordered)

            Button("Create event") {
              showCreateGoogleEvent = true
            }
            .buttonStyle(.bordered)
          }
        .padding(.horizontal, 16)

        if calendarStore.isLoading {
          ProgressView("Loading iCal events...")
            .padding(.horizontal, 16)
            .frame(maxWidth: .infinity, alignment: .leading)
        }

        if !calendarStore.statusMessage.isEmpty {
          Text(calendarStore.statusMessage)
            .font(.caption)
            .foregroundStyle(.secondary)
            .padding(.horizontal, 16)
            .frame(maxWidth: .infinity, alignment: .leading)
        }

        List {
          ForEach(groupedEvents, id: \.day) { group in
            Section(header: Text(group.day.shortDate)) {
              ForEach(group.items) { event in
                CalendarEventRow(event: event) {
                  selectedEvent = event
                }
                .listRowBackground(Color.clear)
              }
            }
          }
        }
        .scrollContentBackground(.hidden)
        .listStyle(.insetGrouped)
      }
      .background(
        LinearGradient(
          colors: [
            Color(red: 0.05, green: 0.09, blue: 0.17),
            Color(red: 0.02, green: 0.06, blue: 0.12),
          ],
          startPoint: .topLeading,
          endPoint: .bottomTrailing
        )
        .ignoresSafeArea()
      )
      .navigationTitle("Calendar")
    }
    .onAppear {
      if iCalURL.isEmpty {
        iCalURL = configStore.config.externalIcalUrl
      }
      Task {
        if googleAuthStore.isAuthenticated {
          await calendarStore.loadGoogleCalendars()
        }
        if calendarStore.events.isEmpty {
          await calendarStore.loadCombinedEvents(icalURL: iCalURL)
        }
      }
    }
    .sheet(item: $selectedEvent) { event in
      NavigationStack {
        CalendarEventDetailView(event: event)
          .navigationTitle(event.summary.isEmpty ? "Event" : event.summary)
      }
      .presentationDetents([.medium, .large])
    }
    .sheet(isPresented: $showCreateGoogleEvent) {
      CreateGoogleEventSheet { summary, location, description, start, end in
        Task {
          await calendarStore.createGoogleEvent(
            summary: summary,
            location: location,
            description: description,
            start: start,
            end: end
          )
        }
      }
    }
  }

  private var groupedEvents: [(day: Date, items: [CalendarEvent])] {
    let grouped = Dictionary(grouping: calendarStore.events) { event in
      Calendar.current.startOfDay(for: event.start)
    }
    return grouped.keys.sorted().map { day in
      let items = (grouped[day] ?? []).sorted { $0.start < $1.start }
      return (day: day, items: items)
    }
  }
}

struct CreateGoogleEventSheet: View {
  @Environment(\.dismiss) private var dismiss
  let onSave: (String, String, String, Date, Date) -> Void

  @State private var summary: String = ""
  @State private var location: String = ""
  @State private var description: String = ""
  @State private var start: Date = Date().addingTimeInterval(30 * 60)
  @State private var end: Date = Date().addingTimeInterval(90 * 60)

  var body: some View {
    NavigationStack {
      Form {
        TextField("Summary", text: $summary)
        TextField("Location", text: $location)
        TextField("Description", text: $description, axis: .vertical)
          .lineLimit(3...8)
        DatePicker("Start", selection: $start)
        DatePicker("End", selection: $end)
      }
      .navigationTitle("Create Google event")
      .toolbar {
        ToolbarItem(placement: .cancellationAction) {
          Button("Cancel") { dismiss() }
        }
        ToolbarItem(placement: .confirmationAction) {
          Button("Create") {
            onSave(summary.isEmpty ? "Event" : summary, location, description, start, end)
            dismiss()
          }
          .disabled(end <= start)
        }
      }
    }
    .frame(minWidth: 460, minHeight: 420)
  }
}

struct CalendarEventRow: View {
  let event: CalendarEvent
  let onShowDetails: () -> Void
  @Environment(\.openURL) private var openURL
  @EnvironmentObject private var focusStore: FocusStore
  @State private var blockedMessage: String = ""

#if os(macOS)
  @State private var showHoverDetails = false
#endif

  var body: some View {
    VStack(alignment: .leading, spacing: 6) {
      HStack(alignment: .firstTextBaseline) {
        Text(event.summary.isEmpty ? "Event" : event.summary)
          .font(.subheadline.weight(.semibold))
        Spacer()
        Text(event.whenText)
          .font(.caption)
          .foregroundStyle(.secondary)
      }

      if !event.location.isEmpty {
        Text(event.location)
          .font(.caption)
          .foregroundStyle(.secondary)
      }

      HStack(spacing: 8) {
        if !event.sourceUrl.isEmpty {
          Button {
            guard let url = URL(string: event.sourceUrl) else { return }
            if focusStore.isBlocked(url: url) {
              blockedMessage = focusStore.blockedReason(for: url)
              return
            }
            openURL(url)
          } label: {
            Label("Open", systemImage: "link")
          }
          .font(.caption.weight(.semibold))
          .buttonStyle(.bordered)
        }

        Button("Details") {
          onShowDetails()
        }
        .font(.caption.weight(.semibold))
        .buttonStyle(.bordered)
      }
    }
    .padding(10)
    .background(
      RoundedRectangle(cornerRadius: 12, style: .continuous)
        .fill(Color.white.opacity(0.08))
    )
    .overlay(
      RoundedRectangle(cornerRadius: 12, style: .continuous)
        .stroke(Color.white.opacity(0.12), lineWidth: 1)
    )
#if os(macOS)
    .onHover { hovering in
      showHoverDetails = hovering
    }
    .popover(isPresented: $showHoverDetails, arrowEdge: .trailing) {
      CalendarEventDetailView(event: event)
        .frame(width: 420)
        .padding(8)
    }
#endif
    .alert("Blocked", isPresented: Binding(get: { !blockedMessage.isEmpty }, set: { if !$0 { blockedMessage = "" } })) {
      Button("OK", role: .cancel) { blockedMessage = "" }
    } message: {
      Text(blockedMessage)
    }
  }
}

struct CalendarEventDetailView: View {
  let event: CalendarEvent
  @Environment(\.openURL) private var openURL
  @EnvironmentObject private var focusStore: FocusStore
  @State private var blockedMessage: String = ""

  var body: some View {
    ScrollView {
      VStack(alignment: .leading, spacing: 10) {
        row("Calendar", event.calendarName)
        row("When", event.whenText)
        row("Location", event.location)
        row("Description", event.description)
        row("Attendees", event.attendees.joined(separator: ", "))
        row("Source", event.sourceUrl)
        row("Meeting", event.meetingLink)

        HStack(spacing: 8) {
          if !event.sourceUrl.isEmpty {
            Button("Open source") {
              guard let url = URL(string: event.sourceUrl) else { return }
              if focusStore.isBlocked(url: url) {
                blockedMessage = focusStore.blockedReason(for: url)
                return
              }
              openURL(url)
            }
            .buttonStyle(.borderedProminent)
            .tint(.teal)
          }
          if !event.meetingLink.isEmpty {
            Button("Open meeting") {
              guard let url = URL(string: event.meetingLink) else { return }
              if focusStore.isBlocked(url: url) {
                blockedMessage = focusStore.blockedReason(for: url)
                return
              }
              openURL(url)
            }
            .buttonStyle(.bordered)
          }
        }
      }
      .frame(maxWidth: .infinity, alignment: .leading)
      .padding(14)
    }
    .alert("Blocked", isPresented: Binding(get: { !blockedMessage.isEmpty }, set: { if !$0 { blockedMessage = "" } })) {
      Button("OK", role: .cancel) { blockedMessage = "" }
    } message: {
      Text(blockedMessage)
    }
  }

  private func row(_ title: String, _ value: String) -> some View {
    VStack(alignment: .leading, spacing: 2) {
      Text(title)
        .font(.caption.weight(.semibold))
        .foregroundStyle(.secondary)
      Text(value.isEmpty ? "-" : value)
        .font(.subheadline)
        .textSelection(.enabled)
    }
  }
}
