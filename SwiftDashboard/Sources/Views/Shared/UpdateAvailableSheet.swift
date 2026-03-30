import SwiftUI

struct UpdateAvailableSheet: View {
  let manifest: UpdateManifest

  @Environment(\.dismiss) private var dismiss
  @EnvironmentObject private var updateStore: UpdateStore

  var body: some View {
    NavigationStack {
      ZStack {
        WorkspaceBackground()

        ScrollView {
          VStack(alignment: .leading, spacing: 20) {
            WorkspacePanel(tint: .orange) {
              VStack(alignment: .leading, spacing: 18) {
                Text("UPDATE AVAILABLE")
                  .font(.caption2.weight(.bold))
                  .tracking(2.4)
                  .foregroundStyle(Color.white.opacity(0.70))

                Text("A newer dev build is ready.")
                  .font(.system(size: 34, weight: .bold, design: .serif))
                  .foregroundStyle(.white)

                Text("Download the new DMG from GitHub, replace the installed app, and relaunch to continue on the latest codebase.")
                  .font(.subheadline)
                  .foregroundStyle(Color.white.opacity(0.72))
                  .fixedSize(horizontal: false, vertical: true)

                LazyVGrid(columns: [GridItem(.adaptive(minimum: 150), spacing: 12)], spacing: 12) {
                  sheetMetric(title: "Version", value: manifest.version, detail: "marketing version", tint: .teal)
                  sheetMetric(title: "Build", value: "\(manifest.build)", detail: "published build", tint: .orange)
                  sheetMetric(title: "Channel", value: manifest.channel.uppercased(), detail: "release stream", tint: .pink)
                  sheetMetric(title: "Published", value: manifest.publishedAt.shortDateTime, detail: "UTC in manifest", tint: .blue)
                }

                VStack(alignment: .leading, spacing: 8) {
                  Text("Minimum macOS")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(Color.white.opacity(0.68))
                  Text(manifest.minimumSystemVersion)
                    .font(.title3.weight(.semibold))
                    .foregroundStyle(.white)
                }

                HStack(spacing: 10) {
                  Button("Download update") {
                    updateStore.openDownloadURL()
                  }
                  .buttonStyle(.borderedProminent)
                  .tint(.teal)

                  Button("View release notes") {
                    updateStore.openReleaseNotesURL()
                  }
                  .buttonStyle(.bordered)

                  Button("Later") {
                    closeSheet()
                  }
                  .buttonStyle(.bordered)
                }
              }
            }
          }
          .padding(.horizontal, 24)
          .padding(.vertical, 28)
          .frame(maxWidth: 780)
          .frame(maxWidth: .infinity)
        }
      }
      .navigationTitle("Update")
      .toolbar {
        ToolbarItem(placement: .cancellationAction) {
          Button("Later") {
            closeSheet()
          }
        }
      }
    }
  }

  private func closeSheet() {
    updateStore.dismissUpdate()
    dismiss()
  }

  private func sheetMetric(title: String, value: String, detail: String, tint: Color) -> some View {
    VStack(alignment: .leading, spacing: 8) {
      Text(title)
        .font(.caption.weight(.semibold))
        .foregroundStyle(Color.white.opacity(0.68))
      Text(value)
        .font(.system(size: 24, weight: .bold, design: .rounded))
        .foregroundStyle(tint)
      Text(detail)
        .font(.caption)
        .foregroundStyle(Color.white.opacity(0.62))
        .fixedSize(horizontal: false, vertical: true)
    }
    .padding(16)
    .frame(maxWidth: .infinity, alignment: .leading)
    .background(
      RoundedRectangle(cornerRadius: 20, style: .continuous)
        .fill(Color.white.opacity(0.08))
    )
  }
}
