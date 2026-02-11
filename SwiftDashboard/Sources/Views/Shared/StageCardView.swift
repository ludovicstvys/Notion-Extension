import SwiftUI

struct StageCardView: View {
  let stage: Stage
  let limitExceeded: Bool
  let onStatusChange: (StageStatus) -> Void
  let onDelete: () -> Void

  @Environment(\.openURL) private var openURL
  @EnvironmentObject private var focusStore: FocusStore
  @State private var blockedMessage: String = ""

  var body: some View {
    VStack(alignment: .leading, spacing: 10) {
      HStack(alignment: .firstTextBaseline) {
        Text(stage.company.isEmpty ? "Unknown company" : stage.company)
          .font(.headline)
        Spacer(minLength: 8)
        Text(stage.status.rawValue)
          .font(.caption.weight(.semibold))
          .foregroundStyle(colorForStatus(stage.status))
      }

      Text(stage.title.isEmpty ? "Stage" : stage.title)
        .font(.subheadline)
        .foregroundStyle(.secondary)

      if let deadline = stage.deadline {
        Label(deadline.shortDate, systemImage: "clock")
          .font(.caption)
          .foregroundStyle(.secondary)
      }

      if !stage.location.isEmpty {
        Label(stage.location, systemImage: "mappin.and.ellipse")
          .font(.caption)
          .foregroundStyle(.secondary)
      }

      if !stage.url.isEmpty {
        Button {
          guard let url = URL(string: stage.url) else { return }
          if focusStore.isBlocked(url: url) {
            blockedMessage = focusStore.blockedReason(for: url)
            return
          }
          openURL(url)
        } label: {
          Label("Open offer", systemImage: "link")
            .font(.caption.weight(.semibold))
        }
        .buttonStyle(.borderless)
      }

      HStack(spacing: 8) {
        Menu {
          ForEach(StageStatus.allCases) { status in
            if status != stage.status {
              Button(status.rawValue) {
                onStatusChange(status)
              }
            }
          }
        } label: {
          Label("Move", systemImage: "arrow.triangle.2.circlepath")
        }
        .font(.caption.weight(.semibold))
        .buttonStyle(.bordered)
        .tint(.teal)

        Button(role: .destructive, action: onDelete) {
          Label("Delete", systemImage: "trash")
        }
        .font(.caption.weight(.semibold))
        .buttonStyle(.bordered)
      }
    }
    .padding(12)
    .background(
      RoundedRectangle(cornerRadius: 14, style: .continuous)
        .fill(
          LinearGradient(
            colors: [
              Color(red: 0.08, green: 0.12, blue: 0.20),
              Color(red: 0.05, green: 0.08, blue: 0.16),
            ],
            startPoint: .topLeading,
            endPoint: .bottomTrailing
          )
        )
    )
    .overlay(
      RoundedRectangle(cornerRadius: 14, style: .continuous)
        .stroke(limitExceeded ? Color.red.opacity(0.6) : Color.white.opacity(0.12), lineWidth: 1)
    )
    .alert("Blocked", isPresented: Binding(get: { !blockedMessage.isEmpty }, set: { if !$0 { blockedMessage = "" } })) {
      Button("OK", role: .cancel) {
        blockedMessage = ""
      }
    } message: {
      Text(blockedMessage)
    }
  }

  private func colorForStatus(_ status: StageStatus) -> Color {
    switch status {
    case .open: return .blue
    case .applied: return .green
    case .interview: return .orange
    case .rejected: return .red
    }
  }
}
