import Foundation
import SwiftUI
import UserNotifications

#if os(iOS)
import UIKit
#elseif os(macOS)
import AppKit
#endif

private enum NotificationActionID {
  static let snooze15 = "SNOOZE_15_MIN"
  static let snooze60 = "SNOOZE_60_MIN"
  static let snoozeTomorrow = "SNOOZE_TOMORROW"
  static let openLink = "OPEN_EVENT_LINK"
}

private enum NotificationCategoryID {
  static let calendarEvent = "CALENDAR_EVENT_CATEGORY"
}

@MainActor
final class NotificationScheduler: NSObject, ObservableObject {
  @Published private(set) var authorizationStatus: UNAuthorizationStatus = .notDetermined
  @Published var lastStatusMessage: String = ""

  private let center = UNUserNotificationCenter.current()
  private weak var diagnostics: DiagnosticsStore?
  private weak var focusStore: FocusStore?

  init(diagnostics: DiagnosticsStore?, focusStore: FocusStore? = nil) {
    self.diagnostics = diagnostics
    self.focusStore = focusStore
    super.init()
    center.delegate = self
    registerCategory()
    Task {
      await refreshAuthorizationStatus()
    }
  }

  func requestAuthorization() async {
    do {
      let granted = try await center.requestAuthorization(options: [.alert, .badge, .sound])
      await refreshAuthorizationStatus()
      lastStatusMessage = granted ? "Notifications enabled." : "Notifications denied."
      diagnostics?.log(
        severity: granted ? .info : .warning,
        category: "notifications",
        message: lastStatusMessage
      )
    } catch {
      lastStatusMessage = "Notification auth failed: \(error.localizedDescription)"
      diagnostics?.log(
        severity: .error,
        category: "notifications",
        message: lastStatusMessage
      )
    }
  }

  func scheduleEventReminders(events: [CalendarEvent], prefs: ReminderPrefs) async {
    guard authorizationStatus == .authorized || authorizationStatus == .provisional else {
      lastStatusMessage = "Notifications not authorized."
      return
    }

    await removeEventNotifications()

    let now = Date()
    var scheduled = 0
    for event in events {
      let offsets = prefs.offsets(for: event.eventType)
      for offset in offsets {
        let fireDate = event.start.addingTimeInterval(TimeInterval(-offset * 60))
        if fireDate <= now { continue }
        let id = "event|\(event.id)|m\(offset)"
        let content = UNMutableNotificationContent()
        content.title = offset >= 60 ? "Event in \(offset / 60)h" : "Event soon"
        content.body = "\(event.summary) (\(event.whenText))"
        content.sound = .default
        content.categoryIdentifier = NotificationCategoryID.calendarEvent
        content.userInfo = [
          "eventID": event.id,
          "summary": event.summary,
          "startISO": event.start.iso8601String,
          "sourceUrl": event.sourceUrl,
          "meetingLink": event.meetingLink,
        ]
        let trigger = UNCalendarNotificationTrigger(
          dateMatching: Calendar.current.dateComponents(
            [.year, .month, .day, .hour, .minute, .second],
            from: fireDate
          ),
          repeats: false
        )
        let request = UNNotificationRequest(identifier: id, content: content, trigger: trigger)
        do {
          try await center.add(request)
          scheduled += 1
        } catch {
          diagnostics?.log(
            severity: .warning,
            category: "notifications",
            message: "Unable to schedule reminder.",
            metadata: ["eventID": event.id, "error": error.localizedDescription]
          )
        }
      }
    }

    lastStatusMessage = "Scheduled \(scheduled) reminder(s)."
    diagnostics?.log(category: "notifications", message: lastStatusMessage)
  }

  func removeEventNotifications() async {
    let pending = await center.pendingNotificationRequests()
    let ids = pending
      .map(\.identifier)
      .filter { $0.hasPrefix("event|") || $0.hasPrefix("snooze|") }
    center.removePendingNotificationRequests(withIdentifiers: ids)
  }

  func refreshAuthorizationStatus() async {
    let settings = await center.notificationSettings()
    authorizationStatus = settings.authorizationStatus
  }

  private func registerCategory() {
    let actions = [
      UNNotificationAction(
        identifier: NotificationActionID.snooze15,
        title: "Snooze 15m",
        options: []
      ),
      UNNotificationAction(
        identifier: NotificationActionID.snooze60,
        title: "Snooze 1h",
        options: []
      ),
      UNNotificationAction(
        identifier: NotificationActionID.snoozeTomorrow,
        title: "Snooze tomorrow",
        options: []
      ),
      UNNotificationAction(
        identifier: NotificationActionID.openLink,
        title: "Open link",
        options: [.foreground]
      ),
    ]
    let category = UNNotificationCategory(
      identifier: NotificationCategoryID.calendarEvent,
      actions: actions,
      intentIdentifiers: [],
      options: [.customDismissAction]
    )
    center.setNotificationCategories([category])
  }

  private func scheduleSnooze(from userInfo: [AnyHashable: Any], minutes: Int) async {
    guard let title = userInfo["summary"] as? String else { return }
    let id = "snooze|\(UUID().uuidString)"
    let content = UNMutableNotificationContent()
    content.title = "Reminder"
    content.body = title
    content.sound = .default
    content.categoryIdentifier = NotificationCategoryID.calendarEvent
    content.userInfo = userInfo

    let trigger = UNTimeIntervalNotificationTrigger(timeInterval: TimeInterval(minutes * 60), repeats: false)
    let request = UNNotificationRequest(identifier: id, content: content, trigger: trigger)
    do {
      try await center.add(request)
      diagnostics?.log(
        category: "notifications",
        message: "Snooze scheduled.",
        metadata: ["minutes": "\(minutes)"]
      )
    } catch {
      diagnostics?.log(
        severity: .warning,
        category: "notifications",
        message: "Unable to schedule snooze.",
        metadata: ["error": error.localizedDescription]
      )
    }
  }

  private func openEventLink(from userInfo: [AnyHashable: Any]) {
    let meeting = (userInfo["meetingLink"] as? String) ?? ""
    let source = (userInfo["sourceUrl"] as? String) ?? ""
    let target = meeting.isEmpty ? source : meeting
    guard let url = URL(string: target), !target.isEmpty else { return }
    if let focusStore, focusStore.isBlocked(url: url) {
      diagnostics?.log(
        severity: .warning,
        category: "notifications",
        message: "Open link blocked by focus mode.",
        metadata: ["url": target]
      )
      return
    }
#if os(iOS)
    UIApplication.shared.open(url)
#elseif os(macOS)
    NSWorkspace.shared.open(url)
#endif
  }
}

extension NotificationScheduler: UNUserNotificationCenterDelegate {
  nonisolated func userNotificationCenter(
    _ center: UNUserNotificationCenter,
    willPresent notification: UNNotification
  ) async -> UNNotificationPresentationOptions {
    [.banner, .sound]
  }

  nonisolated func userNotificationCenter(
    _ center: UNUserNotificationCenter,
    didReceive response: UNNotificationResponse
  ) async {
    let userInfo = response.notification.request.content.userInfo
    switch response.actionIdentifier {
    case NotificationActionID.snooze15:
      await scheduleSnooze(from: userInfo, minutes: 15)
    case NotificationActionID.snooze60:
      await scheduleSnooze(from: userInfo, minutes: 60)
    case NotificationActionID.snoozeTomorrow:
      await scheduleSnooze(from: userInfo, minutes: 24 * 60)
    case NotificationActionID.openLink, UNNotificationDefaultActionIdentifier:
      await MainActor.run {
        self.openEventLink(from: userInfo)
      }
    default:
      break
    }
  }
}
