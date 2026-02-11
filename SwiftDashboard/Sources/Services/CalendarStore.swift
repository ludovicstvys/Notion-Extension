import Foundation
import SwiftUI

@MainActor
final class CalendarStore: ObservableObject {
  @Published private(set) var events: [CalendarEvent] = []
  @Published private(set) var googleCalendars: [GoogleCalendarDescriptor] = []
  @Published var isLoading: Bool = false
  @Published var statusMessage: String = ""
  @Published var selectedCalendarIDs: Set<String> = []

  private let icsService: ICSService
  private let googleService: GoogleCalendarService
  private weak var configStore: ConfigStore?
  private weak var googleAuthStore: GoogleAuthStore?
  private weak var notificationScheduler: NotificationScheduler?
  private weak var diagnostics: DiagnosticsStore?

  init(
    configStore: ConfigStore,
    googleAuthStore: GoogleAuthStore,
    notificationScheduler: NotificationScheduler?,
    diagnostics: DiagnosticsStore?,
    icsService: ICSService = ICSService(),
    googleService: GoogleCalendarService = GoogleCalendarService()
  ) {
    self.configStore = configStore
    self.googleAuthStore = googleAuthStore
    self.notificationScheduler = notificationScheduler
    self.diagnostics = diagnostics
    self.icsService = icsService
    self.googleService = googleService
    self.selectedCalendarIDs = Set(configStore.config.googleSelectedCalendarIDs)
  }

  func loadExternalCalendar(url: String) async {
    let clean = url.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !clean.isEmpty else {
      events = []
      statusMessage = "No iCal URL configured."
      return
    }

    isLoading = true
    defer { isLoading = false }

    do {
      let now = Date()
      let range = DateInterval(start: now.addingDays(-30), end: now.addingDays(365))
      let loaded = try await icsService.fetchEvents(from: clean, range: range)
      events = loaded
      statusMessage = loaded.isEmpty ? "No event found." : "\(loaded.count) events loaded."
      diagnostics?.log(category: "calendar-ical", message: statusMessage)
    } catch {
      statusMessage = "Calendar load error: \(error.localizedDescription)"
      diagnostics?.log(
        severity: .warning,
        category: "calendar-ical",
        message: statusMessage
      )
    }
  }

  func loadGoogleCalendars() async {
    guard let googleAuthStore else { return }
    do {
      let token = try await googleAuthStore.validAccessToken()
      let calendars = try await googleService.listCalendars(accessToken: token)
      googleCalendars = calendars
      if selectedCalendarIDs.isEmpty {
        let defaults = calendars.filter(\.isPrimary).map(\.id)
        selectedCalendarIDs = Set(defaults.isEmpty ? calendars.prefix(2).map(\.id) : defaults)
        configStore?.update { config in
          config.googleSelectedCalendarIDs = Array(selectedCalendarIDs).sorted()
        }
      }
      statusMessage = "Google calendars loaded (\(calendars.count))."
      diagnostics?.log(category: "calendar-google", message: statusMessage)
    } catch {
      statusMessage = "Google calendars error: \(error.localizedDescription)"
      diagnostics?.log(
        severity: .warning,
        category: "calendar-google",
        message: statusMessage
      )
    }
  }

  func setCalendarSelected(calendarID: String, isSelected: Bool) {
    if isSelected {
      selectedCalendarIDs.insert(calendarID)
    } else {
      selectedCalendarIDs.remove(calendarID)
    }
    configStore?.update { config in
      config.googleSelectedCalendarIDs = Array(selectedCalendarIDs).sorted()
    }
  }

  func loadCombinedEvents(icalURL: String?) async {
    guard let configStore else { return }
    isLoading = true
    defer { isLoading = false }

    let now = Date()
    let range = DateInterval(start: now.addingDays(-30), end: now.addingDays(365))

    var merged: [CalendarEvent] = []
    var fragments: [String] = []

    let icalSource = (icalURL ?? configStore.config.externalIcalUrl).trimmingCharacters(in: .whitespacesAndNewlines)
    if !icalSource.isEmpty {
      do {
        let loaded = try await icsService.fetchEvents(from: icalSource, range: range)
        merged.append(contentsOf: loaded)
        fragments.append("iCal: \(loaded.count)")
      } catch {
        fragments.append("iCal error")
        diagnostics?.log(
          severity: .warning,
          category: "calendar-ical",
          message: "iCal load failed in combined refresh.",
          metadata: ["error": error.localizedDescription]
        )
      }
    }

    if googleAuthStore?.isAuthenticated == true {
      do {
        if googleCalendars.isEmpty {
          await loadGoogleCalendars()
        }
        let token = try await googleAuthStore?.validAccessToken() ?? ""
        if !token.isEmpty {
          let ids = selectedCalendarIDs.isEmpty
            ? configStore.config.googleSelectedCalendarIDs
            : Array(selectedCalendarIDs)
          let loaded = try await googleService.fetchEvents(
            accessToken: token,
            calendarIDs: ids,
            timeMin: range.start,
            timeMax: range.end
          )
          merged.append(contentsOf: loaded)
          fragments.append("Google: \(loaded.count)")
        }
      } catch {
        fragments.append("Google error")
        diagnostics?.log(
          severity: .warning,
          category: "calendar-google",
          message: "Google events refresh failed.",
          metadata: ["error": error.localizedDescription]
        )
      }
    }

    events = merged.sorted { $0.start < $1.start }
    let prefix = fragments.isEmpty ? "No source." : fragments.joined(separator: " | ")
    statusMessage = "\(prefix) | total: \(events.count)"
    diagnostics?.log(category: "calendar", message: statusMessage)

    await notificationScheduler?.scheduleEventReminders(events: events, prefs: configStore.config.reminderPrefs)
  }

  func classifyEventType(summary: String, description: String, location: String) -> EventType {
    let combined = "\(summary) \(description) \(location)".normalizedToken
    if combined.contains("deadline") || combined.contains("date limite") || combined.contains("due") {
      return .deadline
    }
    if combined.contains("entretien") || combined.contains("interview") {
      return .interview
    }
    if combined.contains("meet") || combined.contains("zoom") || combined.contains("teams") {
      return .meeting
    }
    return .defaultType
  }

  func addLocalEvent(_ event: CalendarEvent) async {
    var copy = event
    copy.eventType = classifyEventType(summary: event.summary, description: event.description, location: event.location)
    events.append(copy)
    events.sort { $0.start < $1.start }
    if let prefs = configStore?.config.reminderPrefs {
      await notificationScheduler?.scheduleEventReminders(events: events, prefs: prefs)
    }
  }

  func createGoogleEvent(
    summary: String,
    location: String,
    description: String,
    start: Date,
    end: Date
  ) async {
    guard let configStore else { return }
    do {
      let token = try await googleAuthStore?.validAccessToken() ?? ""
      guard !token.isEmpty else {
        statusMessage = "Google auth required."
        return
      }
      let calendarID = configStore.config.googleDefaultCalendarID.isEmpty
        ? (googleCalendars.first(where: \.isPrimary)?.id ?? "primary")
        : configStore.config.googleDefaultCalendarID
      _ = try await googleService.createEvent(
        accessToken: token,
        calendarID: calendarID,
        summary: summary,
        location: location,
        description: description,
        start: start,
        end: end
      )
      diagnostics?.log(
        category: "calendar-google",
        message: "Google event created.",
        metadata: ["calendarID": calendarID]
      )
      await loadCombinedEvents(icalURL: configStore.config.externalIcalUrl)
    } catch {
      statusMessage = "Google create event error: \(error.localizedDescription)"
      diagnostics?.log(
        severity: .warning,
        category: "calendar-google",
        message: statusMessage
      )
    }
  }
}
