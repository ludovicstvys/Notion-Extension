import SwiftUI

struct DashboardView: View {
  @EnvironmentObject private var stageStore: StageStore
  @EnvironmentObject private var marketNewsStore: MarketNewsStore
  @EnvironmentObject private var focusStore: FocusStore
  @Environment(\.openURL) private var openURL
  @State private var blockedMessage: String = ""

  var body: some View {
    NavigationStack {
      ScrollView {
        VStack(alignment: .leading, spacing: 16) {
          kpiGrid
          weeklyCard
          blockersCard
          qualityCard
          todosCard
          marketsCard
          newsCard
        }
        .padding(16)
      }
      .background(
        LinearGradient(
          colors: [
            Color(red: 0.06, green: 0.10, blue: 0.17),
            Color(red: 0.03, green: 0.06, blue: 0.12),
          ],
          startPoint: .topLeading,
          endPoint: .bottomTrailing
        )
        .ignoresSafeArea()
      )
      .navigationTitle("Dashboard")
      .toolbar {
        ToolbarItem(placement: .automatic) {
          Button {
            Task { await marketNewsStore.refreshAll() }
          } label: {
            Label("Refresh News/Markets", systemImage: "arrow.clockwise")
          }
        }
      }
      .onAppear {
        if marketNewsStore.quotes.isEmpty && marketNewsStore.news.isEmpty {
          Task { await marketNewsStore.refreshAll() }
        }
      }
      .alert("Blocked", isPresented: Binding(get: { !blockedMessage.isEmpty }, set: { if !$0 { blockedMessage = "" } })) {
        Button("OK", role: .cancel) { blockedMessage = "" }
      } message: {
        Text(blockedMessage)
      }
    }
  }

  private var kpiGrid: some View {
    let grouped = Dictionary(grouping: stageStore.stages, by: \.status)
    return LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 12) {
      statCard(title: "Total stages", value: "\(stageStore.stages.count)", color: .teal)
      statCard(title: "Open", value: "\(grouped[.open]?.count ?? 0)", color: .blue)
      statCard(title: "Applied", value: "\(grouped[.applied]?.count ?? 0)", color: .green)
      statCard(title: "Interview", value: "\(grouped[.interview]?.count ?? 0)", color: .orange)
    }
  }

  private var weeklyCard: some View {
    let kpi = stageStore.weeklyKPI
    return sectionCard(title: "Weekly KPI", subtitle: "Week start: \(kpi.weekStart.shortDate)") {
      VStack(alignment: .leading, spacing: 8) {
        HStack {
          Text("Focus mode")
          Spacer()
          Text(focusStore.isEnabled ? "\(focusStore.phase.rawValue) - \(focusStore.remainingSeconds / 60)m" : "off")
            .foregroundStyle(focusStore.isEnabled ? Color.orange : Color.secondary)
        }
        .font(.caption)
        Text("Added this week: \(kpi.addedCount)")
        Text("Applied this week: \(kpi.appliedCount)")
        Text("Total stages: \(kpi.totalCount)")
        Divider().overlay(Color.white.opacity(0.15))
        ForEach(kpi.progressByStatus, id: \.status) { item in
          HStack {
            Text(item.status.rawValue)
            Spacer()
            Text("\(item.count) (\(Int(item.ratio * 100))%)")
          }
          .font(.caption)
          .foregroundStyle(.secondary)
        }
      }
    }
  }

  private var marketsCard: some View {
    sectionCard(title: "Markets", subtitle: "Live symbols from Yahoo") {
      if marketNewsStore.quotes.isEmpty {
        Text(marketNewsStore.isLoadingQuotes ? "Loading quotes..." : "No quote available.")
          .font(.caption)
          .foregroundStyle(.secondary)
      } else {
        VStack(alignment: .leading, spacing: 8) {
          ForEach(marketNewsStore.quotes.prefix(8)) { quote in
            HStack {
              VStack(alignment: .leading, spacing: 2) {
                Text(quote.shortName)
                  .font(.subheadline.weight(.semibold))
                Text(quote.symbol)
                  .font(.caption2)
                  .foregroundStyle(.secondary)
              }
              Spacer()
              VStack(alignment: .trailing, spacing: 2) {
                Text(String(format: "%.2f", quote.price))
                  .font(.subheadline.weight(.bold))
                Text(String(format: "%+.2f%%", quote.changePercent))
                  .font(.caption)
                  .foregroundStyle(quote.changePercent >= 0 ? Color.green : Color.red)
              }
            }
          }
        }
      }
    }
  }

  private var newsCard: some View {
    sectionCard(title: "News", subtitle: "Finance headlines") {
      if marketNewsStore.news.isEmpty {
        Text(marketNewsStore.isLoadingNews ? "Loading news..." : "No headline available.")
          .font(.caption)
          .foregroundStyle(.secondary)
      } else {
        VStack(alignment: .leading, spacing: 8) {
          ForEach(marketNewsStore.news.prefix(8)) { item in
            HStack(alignment: .top) {
              VStack(alignment: .leading, spacing: 2) {
                Text(item.title)
                  .font(.subheadline.weight(.semibold))
                Text("\(item.source) - \(item.publishedAt.shortDateTime)")
                  .font(.caption2)
                  .foregroundStyle(.secondary)
              }
              Spacer()
              Button("Open") {
                guard let url = URL(string: item.link) else { return }
                if focusStore.isBlocked(url: url) {
                  blockedMessage = focusStore.blockedReason(for: url)
                  return
                }
                openURL(url)
              }
              .buttonStyle(.bordered)
              .font(.caption.weight(.semibold))
            }
          }
        }
      }
    }
  }

  private var blockersCard: some View {
    sectionCard(title: "SLA blockers", subtitle: "Open > 7d, Applied > 10d") {
      if stageStore.blockers.isEmpty {
        Text("No blocker found.")
          .font(.caption)
          .foregroundStyle(.secondary)
      } else {
        VStack(alignment: .leading, spacing: 10) {
          ForEach(stageStore.blockers.prefix(6)) { blocker in
            HStack(alignment: .top) {
              VStack(alignment: .leading, spacing: 2) {
                Text(blocker.stage.displayLabel.isEmpty ? "Stage" : blocker.stage.displayLabel)
                  .font(.subheadline.weight(.semibold))
                Text("\(blocker.reason) (\(blocker.stagnantDays)d)")
                  .font(.caption)
                  .foregroundStyle(.secondary)
              }
              Spacer()
              Button("Move \(blocker.suggestedStatus.rawValue)") {
                Task {
                  await stageStore.updateStageStatus(stageID: blocker.stage.id, to: blocker.suggestedStatus)
                }
              }
              .buttonStyle(.borderedProminent)
              .tint(.teal)
              .font(.caption.weight(.semibold))
            }
          }
        }
      }
    }
  }

  private var qualityCard: some View {
    sectionCard(title: "Data quality", subtitle: "Missing fields and quick fixes") {
      if stageStore.qualityIssues.isEmpty {
        Text("No data quality issue.")
          .font(.caption)
          .foregroundStyle(.secondary)
      } else {
        VStack(alignment: .leading, spacing: 10) {
          ForEach(stageStore.qualityIssues.prefix(8)) { issue in
            HStack(alignment: .top) {
              VStack(alignment: .leading, spacing: 2) {
                Text(issue.stage.displayLabel.isEmpty ? "Stage" : issue.stage.displayLabel)
                  .font(.subheadline.weight(.semibold))
                Text("Field: \(issue.field.rawValue)")
                  .font(.caption)
                  .foregroundStyle(.secondary)
                if !issue.suggestedValue.isEmpty {
                  Text("Suggestion: \(issue.suggestedValue)")
                    .font(.caption2)
                    .foregroundStyle(.secondary)
                }
              }
              Spacer()
              if !issue.suggestedValue.isEmpty {
                Button("Apply") {
                  stageStore.applyQualityFix(issue)
                }
                .buttonStyle(.bordered)
                .font(.caption.weight(.semibold))
              }
            }
          }
        }
      }
    }
  }

  private var todosCard: some View {
    sectionCard(title: "Todo", subtitle: "Automations linked to stages") {
      if stageStore.sortedTodos.isEmpty {
        Text("No todo item.")
          .font(.caption)
          .foregroundStyle(.secondary)
      } else {
        VStack(alignment: .leading, spacing: 8) {
          ForEach(stageStore.sortedTodos.prefix(10)) { todo in
            HStack(alignment: .top) {
              VStack(alignment: .leading, spacing: 2) {
                Text(todo.title)
                  .font(.subheadline.weight(.semibold))
                Text("Due: \(todo.dueDate.shortDate)")
                  .font(.caption)
                  .foregroundStyle(.secondary)
              }
              Spacer()
              Menu(todo.status.rawValue) {
                ForEach(TodoStatus.allCases) { status in
                  Button(status.rawValue) {
                    stageStore.setTodoStatus(todoID: todo.id, status: status)
                  }
                }
              }
              .font(.caption.weight(.semibold))
            }
          }
        }
      }
    }
  }

  private func statCard(title: String, value: String, color: Color) -> some View {
    VStack(alignment: .leading, spacing: 6) {
      Text(title)
        .font(.caption)
        .foregroundStyle(.secondary)
      Text(value)
        .font(.title2.weight(.bold))
        .foregroundStyle(color)
    }
    .padding(14)
    .frame(maxWidth: .infinity, alignment: .leading)
    .background(
      RoundedRectangle(cornerRadius: 14, style: .continuous)
        .fill(Color.white.opacity(0.08))
    )
    .overlay(
      RoundedRectangle(cornerRadius: 14, style: .continuous)
        .stroke(Color.white.opacity(0.14), lineWidth: 1)
    )
  }

  private func sectionCard<Content: View>(
    title: String,
    subtitle: String,
    @ViewBuilder content: () -> Content
  ) -> some View {
    VStack(alignment: .leading, spacing: 12) {
      VStack(alignment: .leading, spacing: 4) {
        Text(title)
          .font(.headline)
        Text(subtitle)
          .font(.caption)
          .foregroundStyle(.secondary)
      }
      content()
    }
    .padding(14)
    .frame(maxWidth: .infinity, alignment: .leading)
    .background(
      RoundedRectangle(cornerRadius: 16, style: .continuous)
        .fill(Color.white.opacity(0.08))
    )
    .overlay(
      RoundedRectangle(cornerRadius: 16, style: .continuous)
        .stroke(Color.white.opacity(0.14), lineWidth: 1)
    )
  }
}
