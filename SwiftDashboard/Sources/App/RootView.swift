import SwiftUI

struct RootView: View {
  var body: some View {
    TabView {
      DashboardView()
        .tabItem {
          Label("Dashboard", systemImage: "house.fill")
        }

      StagesView()
        .tabItem {
          Label("Stages", systemImage: "square.grid.2x2.fill")
        }

      CalendarView()
        .tabItem {
          Label("Calendar", systemImage: "calendar")
        }

      SettingsView()
        .tabItem {
          Label("Settings", systemImage: "gearshape.fill")
        }
    }
    .tint(.teal)
  }
}
