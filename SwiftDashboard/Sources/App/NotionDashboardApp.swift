import SwiftUI

@main
struct NotionDashboardApp: App {
  @StateObject private var container = AppContainer()

  var body: some Scene {
    WindowGroup {
      RootView()
        .environmentObject(container.diagnosticsStore)
        .environmentObject(container.configStore)
        .environmentObject(container.googleAuthStore)
        .environmentObject(container.notificationScheduler)
        .environmentObject(container.focusStore)
        .environmentObject(container.stageStore)
        .environmentObject(container.calendarStore)
        .environmentObject(container.marketNewsStore)
    }
  }
}
